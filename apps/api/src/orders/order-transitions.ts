import { OrderStatus as S } from '@prisma/client';

export type OrderActor = 'employer' | 'freelancer' | 'staff' | 'system';
export type OrderAction =
  | 'fund' | 'submit' | 'request_revision' | 'accept' | 'cancel' | 'dispute' | 'auto_accept' | 'resolve';

interface Transition {
  from: S[];
  to: S;
  by: OrderActor[];
}

/**
 * The only allowed status changes. Anything not listed is rejected.
 * `resolve` is special: staff picks the target (COMPLETED or CANCELLED).
 */
export const TRANSITIONS: Record<Exclude<OrderAction, 'resolve'>, Transition> = {
  // Placeholder until the payment provider confirms escrow via webhook.
  fund: { from: [S.AWAITING_PAYMENT], to: S.IN_PROGRESS, by: ['staff', 'system'] },
  submit: { from: [S.IN_PROGRESS, S.REVISION], to: S.SUBMITTED, by: ['freelancer'] },
  request_revision: { from: [S.SUBMITTED], to: S.REVISION, by: ['employer'] },
  accept: { from: [S.SUBMITTED], to: S.COMPLETED, by: ['employer'] },
  auto_accept: { from: [S.SUBMITTED], to: S.COMPLETED, by: ['system'] },
  // Before funding either side may cancel. After funding only the freelancer
  // may walk away (full refund); an unhappy employer opens a dispute instead.
  cancel: { from: [S.AWAITING_PAYMENT, S.IN_PROGRESS, S.REVISION], to: S.CANCELLED, by: ['employer', 'freelancer'] },
  dispute: { from: [S.IN_PROGRESS, S.SUBMITTED, S.REVISION], to: S.DISPUTED, by: ['employer', 'freelancer'] },
};

export function canCancel(status: S, actor: OrderActor): boolean {
  if (status === S.AWAITING_PAYMENT) return actor === 'employer' || actor === 'freelancer';
  return actor === 'freelancer' && (status === S.IN_PROGRESS || status === S.REVISION);
}

export const TERMINAL: S[] = [S.COMPLETED, S.CANCELLED];
