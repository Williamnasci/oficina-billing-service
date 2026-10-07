import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PostgresStore } from '../../dist/infrastructure/postgres-store.mjs';
import { CatalogRepository, priceToCents } from '../../dist/catalog.mjs';
import { ServiceCatalog } from '../../dist/modules/service-catalog/domain/entities/service-catalog.entity.js';
import { BillingService } from '../../dist/service.mjs';
import { message } from '../../dist/infrastructure/contracts.mjs';

test('real PostgreSQL: original decimal rounding, extracted catalog persists, budgets retain price snapshot', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  let store = new PostgresStore(process.env.TEST_DATABASE_URL); await store.init();
  try {
    for (const value of [0, 0.000001, 1.005, 2.675, 175.005, 99999999.99]) {
      const result = await store.pool.query('SELECT ($1::numeric(10,2)*100)::bigint AS cents', [String(value)]);
      assert.equal(priceToCents(value), Number(result.rows[0].cents));
    }
    const id = randomUUID(), orderId = randomUUID();
    let repository = new CatalogRepository(store);
    const service = new ServiceCatalog({ id, name: 'Original SQL catalog', price: 1.005, description: 'Regression' });
    await repository.create(service);
    await assert.rejects(repository.create(service), /already registered/);
    let billing = new BillingService(store, {});
    const quote = suffix => message({ id: orderId + suffix, orderId: orderId + suffix }, 'os', 'billing', 'CreateQuote', { owner: 'integration', customer: {}, diagnosis: 'Test', lines: [{ serviceId: id, description: 'Changed client price', unitPriceCents: 1, quantity: 2 }] });
    await billing.consume(quote('-before')); assert.equal((await store.get(orderId + '-before')).amountCents, 202);
    service.update({ price: 5 }); await repository.update(service);
    await store.close(); store = new PostgresStore(process.env.TEST_DATABASE_URL); await store.init();
    repository = new CatalogRepository(store); billing = new BillingService(store, {});
    assert.equal((await repository.findById(id)).price, 5);
    assert.equal((await store.get(orderId + '-before')).amountCents, 202);
    await billing.consume(quote('-after')); assert.equal((await store.get(orderId + '-after')).amountCents, 1000);
    service.update({ isActive: false }); await repository.update(service);
    await assert.rejects(billing.consume(quote('-inactive')), /missing or inactive/);
    assert.equal(await store.get(orderId + '-inactive'), null);
    assert.equal((await store.pool.query('SELECT count(*)::int AS n FROM outbox WHERE aggregate_id=$1', [orderId + '-inactive'])).rows[0].n, 0);
  } finally { await store.close(); }
});
