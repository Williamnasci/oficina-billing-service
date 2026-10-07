import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { BillingService, billingRoutes } from '../src/service.mjs';
import { message } from '../src/infrastructure/contracts.mjs';
import { MemoryStore } from './helpers.mjs';

const principal = { sub: 'operator', role: 'operator' };
const payload = { owner: 'operator', customer: { email: 'test@example.com' }, diagnosis: 'Trocar filtro', lines: [{ description: 'Filtro', quantity: 1, unitPriceCents: 100 }] };
const event = (type, body = {}, id = type) => message({ id, orderId: 'o' }, 'os', 'billing', type, body);
function fixture() {
  const store = new MemoryStore(); const refunds = [];
  const payment = { id: 'mp-1', externalReference: 'o', amountCents: 100, currency: 'BRL', status: 'approved' };
  const provider = { checkout: async () => ({ preferenceId: 'p', url: 'test' }), payment: async () => payment, refund: async data => refunds.push(data.paymentId) };
  const service = new BillingService(store, provider, { webhookSecret: 'secret' });
  const webhook = () => { const ts = String(Date.now()); const sig = createHmac('sha256', 'secret').update(`id:mp-1;request-id:req;ts:${ts};`).digest('hex'); return { query: { 'data.id': 'mp-1' }, headers: { 'x-request-id': 'req', 'x-signature': `ts=${ts},v1=${sig}` }, body: { type: 'payment', data: { id: 'mp-1' } } }; };
  return { store, provider, service, refunds, payment, webhook };
}
test('budget generation, approval, checkout and payment atomically emit Saga events', async () => {
  const f = fixture(); await assert.rejects(f.service.get('o', principal), /not found/);
  await assert.rejects(f.service.consume({ ...event('CreateQuote', payload), source: 'execution' }), /producer/);
  await f.service.consume(event('CreateQuote', payload)); assert.equal((await f.service.get('o', principal)).amountCents, 100);
  await f.service.decide('o', principal, 'APPROVED');
  await f.service.consume(event('CreateCheckout')); assert.equal((await f.store.get('o')).checkout.preferenceId, 'p');
  await f.service.webhook(f.webhook()); await f.service.webhook(f.webhook());
  assert.equal((await f.store.get('o')).status, 'PAID'); assert.equal(f.store.outbox.filter(e => e.type === 'PaymentApproved').length, 1);
  await f.service.consume(event('CompensateBilling')); assert.equal((await f.store.get('o')).status, 'REFUNDED'); assert.deepEqual(f.refunds, ['mp-1']);
});
test('cancellation tombstones block late quotes and late payment is refunded', async () => {
  const f = fixture(); await f.service.consume(event('CompensateBilling')); await f.service.consume(event('CreateQuote', payload)); assert.equal((await f.store.get('o')).status, 'CANCELLED');
  const late = fixture(); await late.service.consume(event('CreateQuote', payload)); await late.service.decide('o', principal, 'REJECTED');
  await late.service.webhook(late.webhook()); assert.equal((await late.store.get('o')).status, 'REFUNDED'); assert.deepEqual(late.refunds, ['mp-1']);
});
test('malformed, pending, unknown and unmatched payments cannot release execution', async () => {
  const f = fixture(); const bad = f.webhook(); bad.body.data.id = 'other'; await assert.rejects(f.service.webhook(bad), /identity/);
  f.payment.status = 'pending'; assert.deepEqual(await f.service.webhook(f.webhook()), { received: true });
  f.payment.status = 'approved'; await assert.rejects(f.service.webhook(f.webhook()), /Unknown budget/);
  f.payment.externalReference = ''; await assert.rejects(f.service.webhook(f.webhook()), /reference/);
  await assert.rejects(f.service.consume(event('CreateCheckout')), /not created/);
  await f.service.consume(event('CreateQuote', payload));
  await assert.rejects(f.service.consume(event('CreateQuote', payload, 'different')), /already exists/);
  await f.service.consume(event('CreateCheckout')); assert.equal((await f.store.get('o')).checkout, undefined);
  await assert.rejects(f.service.decide('o', principal, 'INVALID'));
  await f.service.decide('o', principal, 'APPROVED'); await assert.rejects(f.service.decide('o', principal, 'REJECTED'), /Idempotency/);
});
test('billing routes expose quote, decision and verified webhook', async () => {
  const f = fixture(); await f.service.consume(event('CreateQuote', payload)); const routes = billingRoutes(f.service); const req = { params: { id: 'o' }, body: { decision: 'APPROVED' } };
  assert.equal((await routes[0].handle(req, principal)).status, 'WAITING_APPROVAL');
  assert.equal((await routes[1].handle(req, principal)).status, 'WAITING_PAYMENT');
  assert.deepEqual(await routes[2].handle(f.webhook()), { received: true });
});
test('a second settled payment is refunded without releasing execution twice', async () => {
  const f = fixture(); await f.service.consume(event('CreateQuote', payload)); await f.service.decide('o', principal, 'APPROVED');
  await f.service.webhook(f.webhook());
  f.payment.id = 'mp-2';
  const ts = String(Date.now()); const signature = createHmac('sha256', 'secret').update(`id:mp-2;request-id:req;ts:${ts};`).digest('hex');
  const req = { query: { 'data.id': 'mp-2' }, headers: { 'x-request-id': 'req', 'x-signature': `ts=${ts},v1=${signature}` }, body: { type: 'payment', data: { id: 'mp-2' } } };
  await f.service.webhook(req); await f.service.webhook(req);
  const data = await f.store.get('o'); assert.equal(data.paymentId, 'mp-1'); assert.deepEqual(data.excessRefunds, ['mp-2']);
  assert.deepEqual(f.refunds, ['mp-2']); assert.equal(f.store.outbox.filter(e => e.type === 'PaymentApproved').length, 1);
});
test('quotes freeze the server catalog price and reject missing/inactive services', async () => {
  const f = fixture();
  await assert.rejects(f.service.getCatalog('missing'), /not found/);
  await assert.rejects(f.service.saveCatalog('filter', { name: 'Filtro', unitPriceCents: 2500 }, ''), /Idempotency/);
  const routes = billingRoutes(f.service);
  const req = { params: { id: 'filter' }, body: { name: 'Filtro', unitPriceCents: 2500 }, headers: { 'idempotency-key': 'catalog-v1' } };
  await routes[4].handle(req, principal); assert.equal((await routes[3].handle(req, principal)).unitPriceCents, 2500);
  const quoteInput = { ...payload, lines: [{ description: 'Client price', serviceId: 'filter', quantity: 2, unitPriceCents: 1 }] };
  await f.service.consume(event('CreateQuote', quoteInput));
  assert.equal((await f.store.get('o')).amountCents, 5000);
  await f.service.saveCatalog('filter', { name: 'Filtro', unitPriceCents: 9000 }, 'catalog-v2');
  assert.equal((await f.store.get('o')).amountCents, 5000);
  const missing = fixture(); await assert.rejects(missing.service.consume(event('CreateQuote', quoteInput)), /missing/);
});
