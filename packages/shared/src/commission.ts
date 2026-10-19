/**
 * Platform commission, charged to the freelancer.
 *
 * One flat rate per order, picked by that order's amount (not by cumulative
 * turnover with the employer):
 *   amount <  30 000 KGS          -> 20%
 *   30 000 <= amount < 300 000    -> 12%
 *   amount >= 300 000 KGS         -> 7%
 *
 * All amounts are integers in minor units (tyiyn, 1 KGS = 100 tyiyn).
 * Rates are basis points (1% = 100 bps).
 */
export interface CommissionTier {
  /** Inclusive lower bound, minor units. */
  fromMinor: number;
  rateBps: number;
}

export const KGS_COMMISSION_TIERS: CommissionTier[] = [
  { fromMinor: 0, rateBps: 2000 },
  { fromMinor: 30_000_00, rateBps: 1200 },
  { fromMinor: 300_000_00, rateBps: 700 },
];

export interface CommissionBreakdown {
  amountMinor: number;
  rateBps: number;
  commissionMinor: number;
  payoutMinor: number;
}

export function commissionRateBps(
  amountMinor: number,
  tiers: CommissionTier[] = KGS_COMMISSION_TIERS,
): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new RangeError('amountMinor must be a positive integer');
  }
  let rate = tiers[0].rateBps;
  for (const tier of tiers) {
    if (amountMinor >= tier.fromMinor) rate = tier.rateBps;
  }
  return rate;
}

export function calculateCommission(
  amountMinor: number,
  tiers: CommissionTier[] = KGS_COMMISSION_TIERS,
): CommissionBreakdown {
  const rateBps = commissionRateBps(amountMinor, tiers);
  // Round half up to the nearest tyiyn.
  const commissionMinor = Math.floor((amountMinor * rateBps + 5000) / 10000);
  return {
    amountMinor,
    rateBps,
    commissionMinor,
    payoutMinor: amountMinor - commissionMinor,
  };
}

export const toMinor = (major: number): number => Math.round(major * 100);
export const toMajor = (minor: number): number => minor / 100;
