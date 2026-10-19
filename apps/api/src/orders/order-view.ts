/**
 * The commission is between the platform and the freelancer; the employer
 * pays the full amount and never sees the fee or the payout.
 */
export function orderForViewer<T extends { employerId: string; freelancerId: string }>(order: T, viewerId: string | undefined) {
  if (viewerId && viewerId === order.employerId && viewerId !== order.freelancerId) {
    const { commissionBps, commissionMinor, payoutMinor, ...rest } = order as T & {
      commissionBps?: number;
      commissionMinor?: number;
      payoutMinor?: number;
    };
    return rest;
  }
  return order;
}
