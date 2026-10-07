import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { CatalogRepository, catalogRoutes, priceToCents } from '../dist/catalog.mjs';
import { ServiceCatalog } from '../dist/modules/service-catalog/domain/entities/service-catalog.entity.js';
import { createHttp } from '../dist/infrastructure/http.mjs';
import { BillingService } from '../dist/service.mjs';
import { message } from '../dist/infrastructure/contracts.mjs';
import { MemoryStore } from './helpers.mjs';

test('Decimal(10,2) rounding agrees with PostgreSQL boundary without floating-point truncation', () => {
  assert.equal(priceToCents(1.005), 101); assert.equal(priceToCents(2.675), 268);
  assert.equal(priceToCents(0), 0); assert.equal(priceToCents(0.000001), 0);
  assert.equal(priceToCents(99999999.99), 9999999999);
  for (const value of [-1, NaN, Infinity, 99999999.995]) assert.throws(() => priceToCents(value));
});
test('catalog repository preserves entity dates, filters budgets/active services and detects missing/duplicate writes', async () => {
  const store = new MemoryStore(), repository = new CatalogRepository(store);
  const active = new ServiceCatalog({ id: 'active', name: ' Active ', price: 1.005 });
  const inactive = new ServiceCatalog({ id: 'inactive', name: 'Inactive', price: 0, isActive: false, description: 'Old service' });
  assert.equal(await repository.findById('missing'), null);
  await repository.create(active); await repository.create(inactive);
  await store.transact('budget', 'initial', 'budget', async () => ({ data: { status: 'WAITING_APPROVAL' } }));
  assert.equal((await repository.findAll()).length, 2); assert.equal((await repository.findAll(true)).length, 1);
  assert.equal((await repository.findById('active')).price, 1.01);
  assert.deepEqual((await repository.findById('active')).createdAt, active.createdAt);
  await assert.rejects(repository.create(active), /already registered/);
  await assert.rejects(repository.update(new ServiceCatalog({ id: 'missing', name: 'Missing', price: 1 })), /not found/);
  active.update({ price: 20, description: 'Updated' }); await repository.update(active);
  assert.equal((await repository.findById('active')).description, 'Updated');
  const old = repository.restore({ id: 'old', name: 'Prototype', unitPriceCents: 7500, isActive: true });
  assert.equal(old.price, 75); assert.equal(old.createdAt.getTime(), 0);
});
test('extracted catalog HTTP CRUD and legacy errors use the same source of quote prices', async () => {
  const store = new MemoryStore(), repository = new CatalogRepository(store);
  const secret = 'catalog-regression-at-least-32-characters';
  const headers = { Authorization: `Bearer ${jwt.sign({ sub: 'admin', role: 'admin' }, secret)}`, 'Content-Type': 'application/json' };
  const app = await createHttp({ service: 'billing', store, broker: { ready: true }, secret, port: 0, spec: {}, routes: catalogRoutes(repository) });
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  const call = (path, method = 'GET', body) => fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    const created = await call('/service-catalog', 'POST', { name: ' Oil change ', price: 150, description: null }); assert.equal(created.status, 201);
    const { id } = await created.json(); assert.match(id, /^[\da-f-]{36}$/);
    const found = await (await call(`/service-catalog/${id}`)).json(); assert.equal(found.name, 'Oil change'); assert.equal(found.price, 150); assert.equal(found.description, null);
    assert.equal((await (await call('/service-catalog')).json()).length, 1);
    for (const invalid of [[], null, { name: 'Test', price: -1 }, { name: 'Test', price: 1, extra: true }]) assert.equal((await call('/service-catalog', 'POST', invalid)).status, 400);
    assert.equal((await call('/service-catalog', 'POST', { name: ' ', price: 1 })).status, 422);
    assert.equal((await call('/service-catalog/missing')).status, 404);
    assert.equal((await call('/service-catalog/missing', 'PATCH', {})).status, 404);
    assert.equal((await call('/service-catalog/missing', 'DELETE')).status, 404);
    const billing = new BillingService(store, {});
    const quote = orderId => message({ id: orderId + '-quote', orderId }, 'os', 'billing', 'CreateQuote', { owner: 'admin', customer: {}, diagnosis: 'Oil change', lines: [{ serviceId: id, description: 'Untrusted', unitPriceCents: 1, quantity: 2 }] });
    await billing.consume(quote('quoted')); assert.equal((await store.get('quoted')).amountCents, 30000);
    assert.equal((await call(`/service-catalog/${id}`, 'PATCH', { name: 'Revised', price: 175.005, description: 'New price', isActive: true })).status, 204);
    assert.equal((await store.get(`catalog:${id}`)).unitPriceCents, 17501);
    assert.equal((await store.get('quoted')).amountCents, 30000);
    assert.equal((await call(`/service-catalog/${id}`, 'DELETE')).status, 204);
    assert.equal((await (await call(`/service-catalog/${id}`)).json()).isActive, false);
    await assert.rejects(billing.consume(quote('inactive')), /missing or inactive/);
    assert.equal(await store.get('inactive'), null);
    const denied = await fetch(base + '/service-catalog', { headers: { Authorization: `Bearer ${jwt.sign({ sub: 'operator', role: 'operator' }, secret)}` } }); assert.equal(denied.status, 403);
    await billing.saveCatalog(id, { name: 'Extension', unitPriceCents: 5000, isActive: true }, 'legacy-extension');
    assert.equal((await repository.findById(id)).price, 50); assert.equal((await repository.findById(id)).description, 'New price');
  } finally { await app.close(); }
});
