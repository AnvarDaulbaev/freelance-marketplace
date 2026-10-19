'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';

/** Shown to signed-in users when a required legal document got a new version. */
export function ConsentGate() {
  const t = useTranslations();
  const locale = useLocale();
  const [pending, setPending] = useState<string[]>([]);

  useEffect(() => {
    api<{ pending: string[] }>('/legal/pending').then((r) => setPending(r.pending)).catch(() => {});
  }, []);

  if (!pending.length) return null;
  return (
    <div className="notice row" style={{ justifyContent: 'space-between' }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <strong>{t('consent.title')}</strong>
        <div className="small" style={{ marginTop: 4 }}>
          {t('consent.body')}{' '}
          {pending.map((d, i) => (
            <span key={d}>
              {i > 0 && ', '}
              <Link href={`/legal/${d}`} target="_blank">{t(`legal.${d}`)}</Link>
            </span>
          ))}
        </div>
      </div>
      <button
        className="btn"
        onClick={async () => {
          const r = await api<{ pending: string[] }>('/legal/accept', { json: { docs: pending, locale } });
          setPending(r.pending);
        }}
      >
        {t('consent.accept')}
      </button>
    </div>
  );
}
