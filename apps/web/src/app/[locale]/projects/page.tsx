import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { formatMoney } from '@/lib/api';
import { serverApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

interface Category { id: string; slug: string; nameRu: string; nameEn: string }
interface ProjectItem {
  id: string;
  title: string;
  description: string;
  budgetMinor: number | null;
  currency: string;
  deadlineDays: number | null;
  createdAt: string;
  category: Category | null;
  _count: { proposals: number };
}

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('projects');
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const [data, categories] = await Promise.all([
    serverApi<{ items: ProjectItem[]; total: number }>(`/projects${qs ? `?${qs}` : ''}`),
    serverApi<Category[]>('/projects/categories'),
  ]);
  const catName = (c: Category) => (locale === 'en' ? c.nameEn : c.nameRu);

  return (
    <div>
      <h1 className="page-title">{t('title')}</h1>
      <form className="card search" method="get">
        <input name="q" defaultValue={sp.q} placeholder={t('search')} aria-label={t('search')} />
        <select name="category" defaultValue={sp.category ?? ''} aria-label={t('allCategories')}>
          <option value="">{t('allCategories')}</option>
          {categories?.map((c) => <option key={c.id} value={c.slug}>{catName(c)}</option>)}
        </select>
        <button className="btn" type="submit">{t('find')}</button>
      </form>
      {!data?.items.length && <p className="muted">{t('empty')}</p>}
      {data?.items.map((p) => (
        <article key={p.id} className="card">
          <h3 style={{ marginBottom: 6 }}><Link href={`/projects/${p.id}`}>{p.title}</Link></h3>
          <p className="muted">{p.description.slice(0, 220)}{p.description.length > 220 ? '…' : ''}</p>
          <div className="row muted small">
            <strong style={{ color: 'var(--text)', fontSize: '1rem' }}>
              {p.budgetMinor != null ? formatMoney(p.budgetMinor, p.currency, locale) : t('noBudget')}
            </strong>
            {p.deadlineDays && <span>{t('deadline', { days: p.deadlineDays })}</span>}
            <span>{t('proposals', { count: p._count.proposals })}</span>
            {p.category && <span className="badge">{catName(p.category)}</span>}
          </div>
        </article>
      ))}
    </div>
  );
}
