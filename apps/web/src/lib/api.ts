/** Browser-side API client. Requests go through the Next.js /api rewrite. */
export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : `HTTP ${status}`);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...rest,
    method: rest.method ?? (json !== undefined ? 'POST' : 'GET'),
    headers: { ...(json !== undefined && { 'Content-Type': 'application/json' }), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export function formatMoney(minor: number | null | undefined, currency = 'KGS', locale = 'ru') {
  if (minor == null) return '—';
  const major = minor / 100;
  // Intl renders KGS as "KGS" in Russian; people write "сом".
  if (currency === 'KGS' && locale === 'ru') {
    return `${new Intl.NumberFormat('ru', { maximumFractionDigits: 0 }).format(major)} сом`;
  }
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(major);
}

export function formatDate(value: string | null | undefined, locale = 'ru', withTime = true) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
    .format(new Date(value));
}

/** Badge colour for any status value used in the UI. */
export function statusTone(status: string): '' | 'success' | 'warn' | 'danger' | 'info' {
  switch (status) {
    case 'OPEN':
    case 'COMPLETED':
    case 'ACCEPTED':
    case 'ACTIVE':
      return 'success';
    case 'AWAITING_PAYMENT':
    case 'SUBMITTED':
    case 'REVISION':
    case 'PENDING':
      return 'warn';
    case 'DISPUTED':
    case 'HIDDEN':
    case 'BLOCKED':
    case 'REJECTED':
      return 'danger';
    case 'IN_PROGRESS':
      return 'info';
    default:
      return '';
  }
}

export interface Me {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MODERATOR' | 'EMPLOYER' | 'FREELANCER';
  status: string;
  locale: 'ru' | 'en';
}
