import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { formatMoney } from '@/lib/api';
import { serverApi } from '@/lib/server-api';
import { StatusBadge } from '@/components/StatusBadge';
import { ProjectActions } from './ProjectActions';

interface Project {
  id: string;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'HIDDEN';
  budgetMinor: number | null;
  currency: string;
  deadlineDays: number | null;
  employerId: string;
  employer: { id: string; name: string };
  category: { nameRu: string; nameEn: string } | null;
  _count: { proposals: number };
}

export default async function ProjectPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('projects');
  const p = await serverApi<Project>(`/projects/${encodeURIComponent(id)}`);
  if (!p) notFound();

  return (
    <div className="stack">
      <article className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <StatusBadge status={p.status} label={t(`status.${p.status}`)} />
          {p.category && <span className="badge">{locale === 'en' ? p.category.nameEn : p.category.nameRu}</span>}
        </div>
        <h1>{p.title}</h1>
        <p style={{ whiteSpace: 'pre-wrap' }}>{p.description}</p>
        <div className="row muted small" style={{ gap: '6px 20px' }}>
          <span>{t('budget')}: <strong>{p.budgetMinor != null ? formatMoney(p.budgetMinor, p.currency, locale) : t('noBudget')}</strong></span>
          {p.deadlineDays && <span>{t('deadline', { days: p.deadlineDays })}</span>}
          <span>{t('employer')}: {p.employer.name}</span>
          <span>{t('proposals', { count: p._count.proposals })}</span>
        </div>
      </article>
      <ProjectActions projectId={p.id} employerId={p.employerId} status={p.status} currency={p.currency} />
    </div>
  );
}
