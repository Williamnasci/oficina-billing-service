import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBudget, approveBudget, recordPayment, compensateBudget, confirmRefund } from '../dist/budget.js';
const quote = () => createBudget('os-1', [{ quantity: 2, unitPriceCents: 1250 }]);
const verified = { id: 'mp-1', externalReference: 'os-1', amountCents: 2500, currency: 'BRL', status: 'approved' };

test('budget uses integer cents and requires positive safe totals', () => {
  assert.equal(quote().amountCents, 2500);
  assert.throws(() => createBudget(' ', [{ quantity: 1, unitPriceCents: 1 }]));
  assert.throws(() => createBudget('os-1', []));
  for (const line of [{ quantity: 0, unitPriceCents: 1 }, { quantity: 1.5, unitPriceCents: 1 }, { quantity: 1, unitPriceCents: -1 }, { quantity: 1, unitPriceCents: 1.1 }, { quantity: 1, unitPriceCents: 0 }, { quantity: 2, unitPriceCents: Number.MAX_SAFE_INTEGER }]) assert.throws(() => createBudget('os-1', [line]));
});
test('payment requires approval and exact reconciliation with provider', () => {
  assert.throws(() => recordPayment(quote(), verified));
  const waiting = approveBudget(quote());
  assert.throws(() => approveBudget(waiting));
  for (const patch of [{ id: ' ' }, { externalReference: 'other' }, { amountCents: 2499 }, { currency: 'USD' }, { status: 'pending' }]) assert.throws(() => recordPayment(waiting, { ...verified, ...patch }));
  const paid = recordPayment(waiting, verified);
  assert.equal(paid.status, 'PAID');
  assert.equal(recordPayment(paid, verified), paid);
  assert.throws(() => recordPayment(paid, { ...verified, id: 'mp-2' }));
});
test('compensation waits for confirmed refund and is idempotent', () => {
  const cancelled = compensateBudget(quote());
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(compensateBudget(cancelled), cancelled);
  assert.throws(() => confirmRefund(cancelled, 'mp-1'));
  const paid = recordPayment(approveBudget(quote()), verified);
  assert.throws(() => confirmRefund(paid, 'mp-1'));
  const pending = compensateBudget(paid);
  assert.equal(pending.status, 'REFUND_PENDING');
  assert.equal(compensateBudget(pending), pending);
  assert.throws(() => confirmRefund(pending, ' '));
  assert.throws(() => confirmRefund(pending, 'mp-2'));
  const refunded = confirmRefund(pending, 'mp-1');
  assert.equal(refunded.status, 'REFUNDED');
  assert.equal(confirmRefund(refunded, 'mp-1'), refunded);
  assert.equal(compensateBudget(refunded), refunded);
});
