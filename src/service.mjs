import { z } from 'zod';
import { createBudget, approveBudget, recordPayment, compensateBudget, confirmRefund } from './budget.ts';
import { message, fingerprint, diagnosisSchema, NotFoundError, RetryableError } from './infrastructure/contracts.mjs';
import { assertOwner } from './infrastructure/http.mjs';
import { validateWebhook } from './mercado-pago.mjs';

export class BillingService {
  constructor(store, provider, { webhookSecret } = {}) { Object.assign(this, { store, provider, webhookSecret }); }
  async get(id, principal) { const data = await this.store.get(id); if (!data) throw new NotFoundError('Budget not found'); assertOwner(data, principal); return data; }
  async consume(event) {
    if (event.source !== 'os' || !['CreateQuote', 'CreateCheckout', 'CompensateBilling', 'RefundLatePayment'].includes(event.type)) throw new Error('Invalid command producer/type');
    return this.store.transact(event.orderId, event.id, fingerprint({ type: event.type, payload: event.payload }), async data => {
      if (event.type === 'CreateQuote') {
        if (data?.status === 'CANCELLED') return { data }; // cancellation tombstone wins
        if (data) throw new Error('Budget already exists');
        const diagnosis = diagnosisSchema.parse({ diagnosis: event.payload.diagnosis, lines: event.payload.lines });
        const budget = createBudget(event.orderId, diagnosis.lines);
        data = { ...budget, owner: event.payload.owner, customer: event.payload.customer, diagnosis: diagnosis.diagnosis, lines: diagnosis.lines };
        return { data, messages: [message(event, 'billing', 'os', 'QuoteCreated', { amountCents: data.amountCents, currency: data.currency })] };
      }
      if (event.type === 'CreateCheckout') {
        if (!data) throw new RetryableError('Budget not created yet');
        if (data.status !== 'WAITING_PAYMENT') return { data };
        const checkout = data.checkout ?? await this.provider.checkout(data, data.customer);
        return { data: { ...data, checkout }, messages: [message(event, 'billing', 'os', 'CheckoutCreated', checkout)] };
      }
      if (!data) data = { orderId: event.orderId, status: 'CANCELLED' };
      let next = compensateBudget(data);
      if (next.status === 'REFUND_PENDING') {
        await this.provider.refund(next);
        next = { ...next, ...confirmRefund(next, next.paymentId) };
      }
      return { data: next, messages: [message(event, 'billing', 'os', 'BillingCompensated', { status: next.status })] };
    });
  }
  async decide(id, principal, decision) {
    await this.get(id, principal);
    const input = z.enum(['APPROVED', 'REJECTED']).parse(decision);
    const event = { id: `${id}:decision`, orderId: id };
    return this.store.transact(id, event.id, input, async data => {
      if (!data || data.status !== 'WAITING_APPROVAL') throw new Error('Budget is not awaiting approval');
      const next = input === 'APPROVED' ? { ...data, ...approveBudget(data) } : { ...data, status: 'CANCELLED' };
      return { data: next, messages: [message(event, 'billing', 'os', input === 'APPROVED' ? 'QuoteApproved' : 'QuoteRejected')] };
    });
  }
  async webhook(req) {
    const id = req.query['data.id'];
    validateWebhook({ signature: req.headers['x-signature'], requestId: req.headers['x-request-id'], dataId: id, secret: this.webhookSecret });
    const body = z.object({ type: z.literal('payment'), data: z.object({ id: z.union([z.string(), z.number()]) }) }).passthrough().parse(req.body);
    if (String(body.data.id).toLowerCase() !== String(id).toLowerCase()) throw new Error('Webhook identity mismatch');
    const payment = await this.provider.payment(String(id));
    if (payment.status !== 'approved') return { received: true };
    const orderId = payment.externalReference;
    if (typeof orderId !== 'string' || !orderId) throw new Error('Unknown payment reference');
    const event = { id: `payment:${payment.id}:approved`, orderId };
    await this.store.transact(orderId, event.id, fingerprint(payment), async data => {
      if (!data) throw new RetryableError('Unknown budget');
      // Two preferences/payment attempts can both settle. Refund the excess without changing the original ledger entry.
      if (data.status === 'PAID' && data.paymentId !== payment.id) {
        const excess = recordPayment({ ...data, status: 'WAITING_PAYMENT' }, payment);
        await this.provider.refund(excess);
        return { data: { ...data, excessRefunds: [...(data.excessRefunds ?? []), payment.id] } };
      }
      const cancelled = ['CANCELLED', 'REFUNDED', 'REFUND_PENDING'].includes(data.status);
      const paid = recordPayment(cancelled ? { ...data, status: 'WAITING_PAYMENT' } : data, payment);
      if (cancelled) {
        const pending = { ...data, ...paid, status: 'REFUND_PENDING' };
        await this.provider.refund(pending);
        return { data: { ...pending, ...confirmRefund(pending, payment.id) } };
      }
      return { data: { ...data, ...paid }, messages: [message(event, 'billing', 'os', 'PaymentApproved', { paymentId: payment.id, amountCents: payment.amountCents })] };
    });
    return { received: true };
  }
}

export function billingRoutes(service) {
  return [
    { method: 'get', path: '/budgets/:id', handle: (req, principal) => service.get(req.params.id, principal) },
    { method: 'post', path: '/budgets/:id/decision', handle: async (req, principal) => (await service.decide(req.params.id, principal, req.body?.decision)).data },
    { method: 'post', path: '/payments/webhook', public: true, handle: req => service.webhook(req) },
  ];
}
