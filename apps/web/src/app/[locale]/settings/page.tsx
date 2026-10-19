'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PasswordInput } from '@/components/PasswordInput';

import { useRouter } from '@/i18n/routing';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/lib/useMe';

type Status = { ok?: string; error?: string };

export default function SettingsPage() {
  const t = useTranslations('settings');
  const te = useTranslations('auth.errors');
  const router = useRouter();
  const { me, loading } = useMe();
  const [email, setEmail] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<Status>({});
  const [pwStatus, setPwStatus] = useState<Status>({});

  if (loading) return null;
  if (!me) {
    router.replace('/login');
    return null;
  }

  const errorText = (err: unknown) => {
    const key = err instanceof ApiError ? err.message : '';
    return te.has(key) ? te(key) : te('generic');
  };

  async function changeEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      const user = await api<{ email: string }>('/auth/change-email', {
        json: { newEmail: f.get('newEmail'), currentPassword: f.get('currentPassword') },
      });
      setEmail(user.email);
      setEmailStatus({ ok: t('emailChanged') });
      form.reset();
    } catch (err) {
      setEmailStatus({ error: errorText(err) });
    }
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get('newPassword') !== f.get('repeatPassword')) {
      setPwStatus({ error: t('passwordsDontMatch') });
      return;
    }
    try {
      await api('/auth/change-password', {
        json: { currentPassword: f.get('currentPassword'), newPassword: f.get('newPassword') },
      });
      setPwStatus({ ok: t('passwordChanged') });
      form.reset();
    } catch (err) {
      setPwStatus({ error: errorText(err) });
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1 className="page-title">{t('title')}</h1>

      <form className="card stack" onSubmit={changeEmail}>
        <h2 style={{ margin: 0 }}>{t('email')}</h2>
        <p className="muted small" style={{ margin: 0 }}>{t('currentEmail')}: <strong>{email ?? me.email}</strong></p>
        <label>{t('newEmail')}<input name="newEmail" type="email" required autoComplete="email" /></label>
        <label>{t('currentPassword')}<PasswordInput name="currentPassword" required autoComplete="current-password" /></label>
        {emailStatus.ok && <p className="small" style={{ margin: 0, color: 'var(--accent)' }}>{emailStatus.ok}</p>}
        {emailStatus.error && <p className="error small">{emailStatus.error}</p>}
        <div><button className="btn" type="submit">{t('saveEmail')}</button></div>
      </form>

      <form className="card stack" onSubmit={changePassword} style={{ marginTop: 16 }}>
        <h2 style={{ margin: 0 }}>{t('password')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('passwordHint')}</p>
        <label>{t('currentPassword')}<PasswordInput name="currentPassword" required autoComplete="current-password" /></label>
        <label>{t('newPassword')}<PasswordInput name="newPassword" required minLength={8} autoComplete="new-password" /></label>
        <label>{t('repeatPassword')}<PasswordInput name="repeatPassword" required minLength={8} autoComplete="new-password" /></label>
        {pwStatus.ok && <p className="small" style={{ margin: 0, color: 'var(--accent)' }}>{pwStatus.ok}</p>}
        {pwStatus.error && <p className="error small">{pwStatus.error}</p>}
        <div><button className="btn" type="submit">{t('savePassword')}</button></div>
      </form>
    </div>
  );
}
