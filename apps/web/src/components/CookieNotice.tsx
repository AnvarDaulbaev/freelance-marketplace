'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

const KEY = 'cookie-notice-ok';

export function CookieNotice() {
  const t = useTranslations();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== '1');
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  return (
    <div className="card cookie">
      <span>
        {t('footer.cookieNotice')} <Link href="/legal/cookies">{t('legal.cookies')}</Link>
      </span>
      <button
        className="btn"
        onClick={() => {
          try { localStorage.setItem(KEY, '1'); } catch {}
          setShow(false);
        }}
      >
        {t('footer.cookieOk')}
      </button>
    </div>
  );
}
