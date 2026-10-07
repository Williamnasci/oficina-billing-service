export interface Budget { orderId: string; amountCents: number; currency: 'BRL'; status: 'WAITING_APPROVAL' | 'WAITING_PAYMENT' | 'PAID' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDED'; paymentId?: string; }
export interface VerifiedPayment { id: string; externalReference: string; amountCents: number; currency: string; status: string; }

export function createBudget(orderId: string, lines: Array<{ quantity: number; unitPriceCents: number }>): Budget {
  if (!orderId.trim() || !lines.length) throw new Error('Order and lines are required');
  let amountCents = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) throw new Error('Invalid quote line');
    amountCents += line.quantity * line.unitPriceCents;
  }
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Invalid quote total');
  return { orderId, amountCents, currency: 'BRL', status: 'WAITING_APPROVAL' };
}

export function approveBudget(budget: Budget): Budget {
  if (budget.status !== 'WAITING_APPROVAL') throw new Error('Quote is not awaiting approval');
  return { ...budget, status: 'WAITING_PAYMENT' };
}

/** Input must come from authenticated GET /v1/payments/{id}, never a browser callback. */
export function recordPayment(budget: Budget, payment: VerifiedPayment): Budget {
  if (!payment.id.trim() || payment.externalReference !== budget.orderId || payment.amountCents !== budget.amountCents || payment.currency !== budget.currency || payment.status !== 'approved') throw new Error('Payment does not match approved quote');
  if (budget.status === 'PAID' && budget.paymentId === payment.id) return budget;
  if (budget.status !== 'WAITING_PAYMENT') throw new Error('Quote is not awaiting payment');
  return { ...budget, status: 'PAID', paymentId: payment.id };
}

export function compensateBudget(budget: Budget): Budget {
  if (['CANCELLED', 'REFUNDED', 'REFUND_PENDING'].includes(budget.status)) return budget;
  return { ...budget, status: budget.status === 'PAID' ? 'REFUND_PENDING' : 'CANCELLED' };
}

export function confirmRefund(budget: Budget, paymentId: string): Budget {
  if (!paymentId.trim() || budget.paymentId !== paymentId) throw new Error('Refund payment mismatch');
  if (budget.status === 'REFUNDED') return budget;
  if (budget.status !== 'REFUND_PENDING') throw new Error('Refund is not pending');
  return { ...budget, status: 'REFUNDED' };
}
