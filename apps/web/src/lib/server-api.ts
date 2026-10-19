import 'server-only';
import { headers } from 'next/headers';

/**
 * Server-side fetch for public data (server components). Forwards the
 * visitor's IP (set by nginx) so the API rate-limits rendered pages per
 * visitor instead of skipping them. Callers must encode dynamic path segments.
 */
export async function serverApi<T = unknown>(path: string): Promise<T | null> {
  if (!path.startsWith('/') || path.includes('..')) return null;
  const clientIp = (await headers()).get('x-real-ip');
  const res = await fetch(`${process.env.API_URL ?? 'http://localhost:4000'}/api${path}`, {
    cache: 'no-store',
    headers: clientIp ? { 'X-Forwarded-For': clientIp } : undefined,
  });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}
