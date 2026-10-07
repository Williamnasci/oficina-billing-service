import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresStore } from '../dist/infrastructure/postgres-store.mjs';

function fixture() {
  let data; let hash; const outbox = new Map(); const calls = [];
  const query = async (sql, args = []) => {
    calls.push(sql);
    if (sql.startsWith('SELECT fingerprint')) return { rowCount: hash ? 1 : 0, rows: hash ? [{ fingerprint: hash }] : [] };
    if (sql.startsWith('SELECT data,version')) return { rows: data ? [{ data, version: 0 }] : [] };
    if (sql.startsWith('INSERT INTO aggregates')) data = args[2];
    if (sql.startsWith('INSERT INTO inbox')) hash = args[2];
    if (sql.startsWith('INSERT INTO outbox')) outbox.set(args[0], args[2]);
    if (sql.startsWith('SELECT data FROM')) return { rows: data ? [{ data }] : [] };
    if (sql.startsWith('SELECT id,data')) return { rows: data ? [{ id: 'o', data }] : [] };
    if (sql.startsWith('SELECT id,envelope')) return { rows: [...outbox].map(([id, envelope]) => ({ id, envelope })) };
    if (sql.startsWith('UPDATE outbox')) outbox.delete(args[0]);
    return { rows: [], rowCount: 0 };
  };
  const client = { query, release: () => calls.push('release') };
  const pool = { query, connect: async () => client, end: async () => calls.push('end') };
  return { store: new PostgresStore('', pool), calls };
}
test('SQL commits aggregate, inbox and outbox together and detects duplicate conflicts', async () => {
  const f = fixture(); await f.store.init(); await f.store.ping(); assert.equal(await f.store.get('o'), null);
  const result = await f.store.transact('o', 'message', 'hash', async (data, tx) => {
    assert.equal(data, null); assert.ok(tx.query); return { data: { status: 'OPEN' }, messages: [{ id: 'out' }] };
  });
  assert.equal(result.duplicate, false); assert.equal((await f.store.get('o')).status, 'OPEN');
  assert.equal((await f.store.pending()).length, 1); assert.equal((await f.store.list()).length, 1);
  const duplicate = await f.store.transact('o', 'message', 'hash', async () => { throw new Error('Should not run'); });
  assert.equal(duplicate.duplicate, true);
  await assert.rejects(f.store.transact('o', 'message', 'other', () => {}), /Idempotency/);
  assert.ok(f.calls.includes('ROLLBACK')); await f.store.markSent('out'); assert.equal((await f.store.pending()).length, 0);
  await f.store.close(); assert.ok(f.calls.includes('end'));
});
test('SQL rejects incomplete decisions and releases clients after rollback', async () => {
  const f = fixture();
  await assert.rejects(f.store.transact('o', 'message', 'hash', async () => ({})), /Decision/);
  await assert.rejects(f.store.transact('o', 'message', 'hash', async () => { throw new Error('Domain failure'); }), /Domain/);
  assert.equal(f.calls.filter(call => call === 'release').length, 2);
  await f.store.transact('o', 'message', 'hash', async () => ({ data: { status: 'OPEN' } }));
  const defaultPool = new PostgresStore('postgresql://invalid:invalid@localhost:1/invalid'); await defaultPool.close();
});
