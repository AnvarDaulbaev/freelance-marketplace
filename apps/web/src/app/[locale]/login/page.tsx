'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PasswordInput } from '@/components/PasswordInput';

import { Link } from '@/i18n/routing';
import { api, ApiError } from '@/lib/api';

export default function LoginPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api('/auth/login', { json: { email: f.get('email'), password: f.get('password') } });
      window.location.href = `/${locale}/dashboard`;
    } catch (err) {
      const key = err instanceof ApiError ? err.message : '';
      setError(t.has(`errors.${key}`) ? t(`errors.${key}`) : t('errors.generic'));
    }
  }

  return (
    <form className="card stack narrow" onSubmit={onSubmit}>
      <h1 style={{ margin: 0 }}>{t('loginTitle')}</h1>
      <label>{t('email')}<input name="email" type="email" required autoComplete="email" /></label>
      <label>{t('password')}<PasswordInput name="password" required autoComplete="current-password" /></label>
      {error && <p className="error">{error}</p>}
      <button className="btn" type="submit">{t('submitLogin')}</button>
      <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>{t('noAccount')} <Link href="/register">{t('submitRegister')}</Link></p>
    </form>
  );
}
