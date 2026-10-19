'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';

export function Header() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { me } = useMe();

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = `/${locale}`;
  }

  return (
    <header className="site">
      <div className="container bar">
        <Link href="/" className="brand">{t('brand')}</Link>
        <nav>
          <Link href="/projects">{t('projects')}</Link>
          {(!me || me.role === 'EMPLOYER') && <Link href="/projects/new">{t('newProject')}</Link>}
          {me && <Link href="/dashboard">{t('dashboard')}</Link>}
          {me && <Link href="/settings">{t('settings')}</Link>}
          {me && (me.role === 'MODERATOR' || me.role === 'ADMIN') && <Link href="/moderation">{t('moderation')}</Link>}
          {me?.role === 'ADMIN' && <Link href="/admin">{t('admin')}</Link>}
        </nav>
        <div className="auth">
          {me ? (
            <button className="btn secondary sm" onClick={logout}>{t('logout')}</button>
          ) : (
            <>
              <Link href="/login">{t('login')}</Link>
              <Link href="/register" className="btn sm">{t('register')}</Link>
            </>
          )}
        </div>
        <select
          className="lang"
          aria-label="Language"
          value={locale}
          onChange={(e) => router.replace(pathname, { locale: e.target.value })}
        >
          <option value="ru">RU</option>
          <option value="en">EN</option>
        </select>
      </div>
    </header>
  );
}
