import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { Link } from '@/i18n/routing';

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  const t = useTranslations('home');
  return (
    <div className="stack">
      <section className="card hero">
        <h1>{t('title')}</h1>
        <p className="muted">{t('subtitle')}</p>
        <div className="row">
          <Link className="btn" href="/projects/new">{t('ctaEmployer')}</Link>
          <Link className="btn secondary" href="/projects">{t('ctaFreelancer')}</Link>
        </div>
      </section>
      <section className="grid4">
        {(['how1', 'how2', 'how3', 'how4'] as const).map((k, i) => (
          <div key={k} className="card">
            <div className="step-num">{i + 1}</div>
            <div>{t(k)}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
