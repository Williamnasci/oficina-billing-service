import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { MercadoPago, validateWebhook } from '../dist/mercado-pago.mjs';

test('HMAC validates exact manifest, normalizes IDs, and rejects tampering or replay', () => {
  const secret = 'secret'; const ts = '1704908010'; const requestId = 'req';
  const digest = createHmac('sha256', secret).update(`id:abc;request-id:req;ts:${ts};`).digest('hex');
  const input = { signature: `ts=${ts},v1=${digest}`, requestId, dataId: 'ABC', secret, now: 1704908010000 };
  validateWebhook(input);
  for (const patch of [{ secret: '' }, { signature: '' }, { requestId: '' }, { dataId: '' }, { signature: `ts=${ts},v1=bad` }, { signature: `ts=invalid,v1=${digest}` }, { now: 1704909010000 }, { requestId: 'tampered' }]) assert.throws(() => validateWebhook({ ...input, ...patch }), { status: 401 });
  const ms = '1704908010000'; validateWebhook({ ...input, signature: `ts=${ms},v1=${createHmac('sha256', secret).update(`id:abc;request-id:req;ts:${ms};`).digest('hex')}` });
});
test('provider creates preference, reconciles receiver/environment, and uses stable refund key', async () => {
  const calls = []; let refunded = false;
  const provider = new MercadoPago({ token: 'token', collectorId: '123', notificationUrl: 'https://test.invalid/webhook', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/checkout/preferences')) return { ok: true, json: async () => ({ id: 'p', sandbox_init_point: 'sandbox', init_point: 'production' }) };
    if (url.endsWith('/refunds')) { refunded = true; return { ok: true, json: async () => ({ status: 'approved' }) }; }
    return { ok: true, json: async () => ({ id: 1, collector_id: 123, live_mode: false, transaction_amount: 1.25, external_reference: 'o', currency_id: 'BRL', status: refunded ? 'refunded' : 'approved' }) };
  } });
  const budget = { orderId: 'o', amountCents: 125, paymentId: '1' };
  assert.equal((await provider.checkout(budget, { email: 'test@example.com' })).url, 'sandbox');
  const payment = await provider.payment('1'); assert.equal(payment.amountCents, 125);
  await provider.refund(budget); assert.equal(calls.find(call => call.url.endsWith('/refunds')).options.headers['X-Idempotency-Key'], 'refund-o-1');
  provider.liveMode = true; assert.equal((await provider.checkout(budget, { email: 'a@b.com' })).url, 'production'); await assert.rejects(provider.payment('1'), /receiver/);
});
test('provider rejects configuration, HTTP errors, invalid amounts and incomplete refunds', async () => {
  const empty = new MercadoPago({}); await assert.rejects(empty.request('/test'), /token/); await assert.rejects(empty.checkout({}, {}), /HTTPS/);
  const failure = new MercadoPago({ token: 't', fetchImpl: async () => ({ ok: false, status: 500 }) }); await assert.rejects(failure.request('/x'), /500/);
  const raw = { id: 1, collector_id: 123, live_mode: false, transaction_amount: 0, status: 'approved' };
  const provider = new MercadoPago({ token: 't', collectorId: '123', fetchImpl: async () => ({ ok: true, json: async () => raw }) });
  await assert.rejects(provider.payment('1'), /amount/); raw.transaction_amount = 1;
  await assert.rejects(provider.refund({ orderId: 'o', paymentId: '1' }), /not confirmed/);
});
