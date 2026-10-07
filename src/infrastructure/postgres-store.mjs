import pg from 'pg';
import { ConflictError } from './contracts.mjs';

export class PostgresStore {
  constructor(url, pool = new pg.Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000 })) { this.pool = pool; }
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS aggregates (
      id text PRIMARY KEY, version integer NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS inbox (aggregate_id text NOT NULL, message_id text NOT NULL, fingerprint text NOT NULL, PRIMARY KEY(aggregate_id,message_id));
      CREATE TABLE IF NOT EXISTS outbox (id text PRIMARY KEY, aggregate_id text NOT NULL, envelope jsonb NOT NULL, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(created_at) WHERE sent_at IS NULL;`);
  }
  async transact(id, messageId, hash, decide) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [id]);
      const duplicate = await client.query('SELECT fingerprint FROM inbox WHERE aggregate_id=$1 AND message_id=$2', [id, messageId]);
      const existing = await client.query('SELECT data,version FROM aggregates WHERE id=$1', [id]);
      if (duplicate.rowCount) {
        if (duplicate.rows[0].fingerprint !== hash) throw new ConflictError('Idempotency key reused with different content');
        await client.query('COMMIT');
        return { data: existing.rows[0]?.data, duplicate: true };
      }
      const result = await decide(existing.rows[0]?.data ?? null, client);
      if (!result?.data) throw new Error('Decision must return aggregate data');
      const version = (existing.rows[0]?.version ?? -1) + 1;
      await client.query(`INSERT INTO aggregates(id,version,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,version=EXCLUDED.version,updated_at=now()`, [id, version, result.data]);
      await client.query('INSERT INTO inbox VALUES($1,$2,$3)', [id, messageId, hash]);
      for (const envelope of result.messages ?? []) {
        await client.query('INSERT INTO outbox(id,aggregate_id,envelope) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING', [envelope.id, id, envelope]);
      }
      await client.query('COMMIT');
      return { data: result.data, duplicate: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async get(id) { return (await this.pool.query('SELECT data FROM aggregates WHERE id=$1', [id])).rows[0]?.data ?? null; }
  async list() { return (await this.pool.query('SELECT id,data FROM aggregates ORDER BY updated_at DESC LIMIT 500')).rows; }
  async pending() { return (await this.pool.query('SELECT id,envelope FROM outbox WHERE sent_at IS NULL ORDER BY created_at,id LIMIT 100')).rows; }
  async markSent(id) { await this.pool.query('UPDATE outbox SET sent_at=now() WHERE id=$1', [id]); }
  async ping() { await this.pool.query('SELECT 1'); }
  async close() { await this.pool.end(); }
}
