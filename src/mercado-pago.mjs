import { createHmac, timingSafeEqual } from 'node:crypto';

export function validateWebhook({ signature, requestId, dataId, secret, now = Date.now(), toleranceMs = 300000 }) {
  if (!secret || !signature || !requestId || !dataId) throw Object.assign(new Error('Invalid webhook signature'), { status: 401 });
  const parts = Object.fromEntries(signature.split(',').map(item => item.trim().split('=')));
  const timestamp = Number(parts.ts);
  // MP examples contain epoch seconds and milliseconds; normalize for replay-window validation.
  const milliseconds = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  if (!Number.isFinite(timestamp) || Math.abs(now - milliseconds) > toleranceMs || !/^[a-f0-9]{64}$/i.test(parts.v1 ?? '')) throw Object.assign(new Error('Invalid webhook signature'), { status: 401 });
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  if (!timingSafeEqual(expected, Buffer.from(parts.v1, 'hex'))) throw Object.assign(new Error('Invalid webhook signature'), { status: 401 });
}

export class MercadoPago {
  constructor({ token, notificationUrl, collectorId, liveMode = false, verifySandboxPreference = false, fetchImpl = fetch, timeoutMs = 8000, baseUrl = 'https://api.mercadopago.com' }) {
    Object.assign(this, { token, notificationUrl, collectorId, liveMode, verifySandboxPreference, fetchImpl, timeoutMs, baseUrl });
  }
  async request(path, method = 'GET', body, key) {
    if (!this.token) throw new Error('Mercado Pago access token is missing');
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method, signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(key ? { 'X-Idempotency-Key': key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Mercado Pago request failed: ${response.status}`);
    return response.json();
  }
  async checkout(budget, customer) {
    if (!/^https:\/\//.test(this.notificationUrl ?? '')) throw new Error('Mercado Pago notification URL must use HTTPS');
    const result = await this.request('/checkout/preferences', 'POST', {
      external_reference: budget.orderId, payer: { email: customer.email }, notification_url: this.notificationUrl,
      items: [{ id: budget.orderId, title: 'Orçamento de oficina', quantity: 1, currency_id: 'BRL', unit_price: budget.amountCents / 100 }],
      expires: true, expiration_date_to: new Date(Date.now() + 86400000).toISOString(),
    });
    // Preferences does not document idempotency; duplicate preferences share immutable external_reference.
    return { preferenceId: result.id, url: this.liveMode ? result.init_point : result.sandbox_init_point };
  }
  async payment(id, findCheckout) {
    const raw = await this.request(`/v1/payments/${encodeURIComponent(id)}`);
    if (String(raw.collector_id) !== String(this.collectorId)) throw new Error('Payment receiver/environment mismatch');
    if (raw.live_mode !== this.liveMode) await this.assertSandboxPreference(raw, findCheckout);
    const cents = Math.round(Number(raw.transaction_amount) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('Invalid provider amount');
    return { id: String(raw.id), externalReference: raw.external_reference, amountCents: cents, currency: raw.currency_id, status: raw.status };
  }
  async assertSandboxPreference(payment, findCheckout) {
    const mismatch = () => new Error('Payment receiver/environment mismatch');
    if (this.liveMode || !this.verifySandboxPreference || payment.live_mode !== true ||
      typeof payment.external_reference !== 'string' || !payment.order?.id || !findCheckout) throw mismatch();
    const checkout = await findCheckout(payment.external_reference);
    if (!checkout?.preferenceId || !/^https:\/\/sandbox\.mercadopago\.com(?:\.br)?\//.test(checkout.url ?? '')) throw mismatch();
    const order = await this.request('/merchant_orders/' + encodeURIComponent(payment.order.id));
    if (order.preference_id !== checkout.preferenceId || order.external_reference !== payment.external_reference ||
      !order.payments?.some(item => String(item.id) === String(payment.id))) throw mismatch();
  }
  async refund(budget) {
    const findCheckout = reference => reference === budget.orderId ? budget.checkout : undefined;
    if (this.verifySandboxPreference) await this.payment(budget.paymentId, findCheckout);
    await this.request(`/v1/payments/${encodeURIComponent(budget.paymentId)}/refunds`, 'POST', {}, `refund-${budget.orderId}-${budget.paymentId}`);
    const current = await this.payment(budget.paymentId, findCheckout);
    if (current.status !== 'refunded') throw new Error('Refund is not confirmed yet');
    return current;
  }
}
