import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED = 50_000;

/**
 * Brute-force protection keyed by (email, client IP): after MAX_FAILURES wrong
 * passwords for one email from one IP within WINDOW_MS, that IP can't try
 * that email until the window passes. Keying by IP too means an attacker
 * can't lock the real owner out of their account from somewhere else.
 * In-memory: fine for a single API instance; move to Redis when scaling out.
 */
@Injectable()
export class LoginLimiter {
  private readonly failures = new Map<string, { count: number; firstAt: number }>();

  assertAllowed(email: string, ip = '') {
    const key = `${email}|${ip}`;
    const entry = this.failures.get(key);
    if (!entry) return;
    if (Date.now() - entry.firstAt > WINDOW_MS) {
      this.failures.delete(key);
      return;
    }
    if (entry.count >= MAX_FAILURES) {
      throw new HttpException('too_many_attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  recordFailure(email: string, ip = '') {
    const key = `${email}|${ip}`;
    if (this.failures.size >= MAX_TRACKED) this.prune();
    const entry = this.failures.get(key);
    if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
      this.failures.set(key, { count: 1, firstAt: Date.now() });
    } else {
      entry.count++;
    }
  }

  reset(email: string, ip = '') {
    this.failures.delete(`${email}|${ip}`);
  }

  private prune() {
    const now = Date.now();
    for (const [key, entry] of this.failures) {
      if (now - entry.firstAt > WINDOW_MS) this.failures.delete(key);
    }
    // Still full (flood of distinct emails): drop the oldest entries.
    for (const key of this.failures.keys()) {
      if (this.failures.size < MAX_TRACKED) break;
      this.failures.delete(key);
    }
  }
}
