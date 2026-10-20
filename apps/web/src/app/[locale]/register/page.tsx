'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PasswordInput } from '@/components/PasswordInput';

import { Link } from '@/i18n/routing';
import { api, ApiError } from '@/lib/api';

const COUNTRIES = ['KG', 'KZ', 'UZ', 'TJ', 'RU', 'BY', 'AM', 'AZ', 'GE', 'DE', 'PL', 'OTHER'];

export default function RegisterPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [error, setError] = useState('');

  const docLink = (doc: string) => {
    const link = <Link href={`/legal/${doc}`} target="_blank">{t(`legal.${doc}`)}</Link>;
    return locale === 'ru' ? <>«{link}»</> : link;
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const country = String(f.get('country') ?? '');
    try {
      await api('/auth/register', {
        json: {
          email: f.get('email'),
          password: f.get('password'),
          name: f.get('name'),
          role: f.get('role'),
          locale,
          country: country && country !== 'OTHER' ? country : undefined,
          // Each checkbox is required in the form; the server re-checks.
          acceptedDocs: [
            ...(f.get('acceptTerms') ? ['terms', 'offer', 'rules'] : []),
            ...(f.get('acceptPrivacy') ? ['privacy'] : []),
          ],
          confirmAdult: f.get('adult') === 'on',
        },
      });
      window.location.href = `/${locale}/dashboard`;
    } catch (err) {
      const key = err instanceof ApiError ? err.message : '';
      setError(t.has(`auth.errors.${key}`) ? t(`auth.errors.${key}`) : t('auth.errors.generic'));
    }
  }

  return (
    <form className="card stack narrow" onSubmit={onSubmit}>
      <h1 style={{ margin: 0 }}>{t('auth.registerTitle')}</h1>
      <fieldset>
        <legend>{t('auth.role')}</legend>
        <div className="choice">
          <label className="check"><input type="radio" name="role" value="EMPLOYER" required defaultChecked /><span>{t('auth.roleEmployer')}</span></label>
          <label className="check"><input type="radio" name="role" value="FREELANCER" required /><span>{t('auth.roleFreelancer')}</span></label>
        </div>
      </fieldset>
      <label>{t('auth.name')}<input name="name" required minLength={2} maxLength={80} pattern="\P{N}*" title={t('auth.errors.name_has_digits')} /></label>
      <label>{t('auth.email')}<input name="email" type="email" required autoComplete="email" /></label>
      <label>
        {t('auth.password')}
        <PasswordInput name="password" required minLength={8} autoComplete="new-password" />
        <span className="hint">{t('auth.passwordHint')}</span>
      </label>
      <label>
        {t('auth.country')}
        <select name="country" defaultValue="KG">
          {COUNTRIES.map((c) => <option key={c} value={c}>{c === 'OTHER' ? '—' : c}</option>)}
        </select>
      </label>
      <div className="stack tight">
      <label className="check">
        <input type="checkbox" name="acceptTerms" required />
        <span>{t('auth.acceptPrefix')} {docLink('terms')}, {docLink('offer')} {t('auth.and')} {docLink('rules')}</span>
      </label>
      <label className="check">
        <input type="checkbox" name="acceptPrivacy" required />
        <span>{t('auth.acceptPrivacy')} {docLink('privacy')}</span>
      </label>
      <label className="check">
        <input type="checkbox" name="adult" required />
        <span>{t('auth.adult')}</span>
      </label>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn" type="submit">{t('auth.submitRegister')}</button>
      <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>{t('auth.haveAccount')} <Link href="/login">{t('auth.submitLogin')}</Link></p>
    </form>
  );
}
