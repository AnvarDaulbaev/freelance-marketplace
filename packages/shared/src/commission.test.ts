import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCommission, commissionRateBps, toMinor } from './commission';

test('tier boundaries', () => {
  assert.equal(commissionRateBps(toMinor(1)), 2000);
  assert.equal(commissionRateBps(toMinor(29_999.99)), 2000);
  assert.equal(commissionRateBps(toMinor(30_000)), 1200);
  assert.equal(commissionRateBps(toMinor(299_999.99)), 1200);
  assert.equal(commissionRateBps(toMinor(300_000)), 700);
  assert.equal(commissionRateBps(toMinor(5_000_000)), 700);
});

test('flat rate on the whole order', () => {
  const r = calculateCommission(toMinor(50_000));
  assert.equal(r.commissionMinor, toMinor(6_000));
  assert.equal(r.payoutMinor, toMinor(44_000));
});

test('rounds to the nearest tyiyn', () => {
  // 0.33 KGS * 20% = 0.066 -> 0.07
  assert.equal(calculateCommission(33).commissionMinor, 7);
});

test('rejects invalid amounts', () => {
  assert.throws(() => calculateCommission(0));
  assert.throws(() => calculateCommission(1.5));
});
