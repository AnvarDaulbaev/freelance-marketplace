'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { StatusBadge } from '@/components/StatusBadge';
import { api, formatMoney } from '@/lib/api';
import { useMe } from '@/lib/useMe';

interface OrderRow { id: string; status: string; amountMinor: number; currency: string; project: { title: string } }
interface ProjectRow { id: string; title: string; status: string; _count: { proposals: number } }
interface ProposalRow { id: string; status: string; priceMinor: number; currency: string; project: { id: string; title: string } }

export default function DashboardPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { me, loading } = useMe();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);

  useEffect(() => {
    if (!me) return;
    api<OrderRow[]>('/orders').then(setOrders).catch(() => {});
    if (me.role === 'EMPLOYER') api<ProjectRow[]>('/projects/mine').then(setProjects).catch(() => {});
    if (me.role === 'FREELANCER') api<ProposalRow[]>('/proposals/mine').then(setProposals).catch(() => {});
  }, [me]);

  if (loading) return <p>{t('common.loading')}</p>;
  if (!me) {
    router.replace('/login');
    return null;
  }
  const empty = <p className="muted" style={{ margin: 0 }}>{t('dashboard.empty')}</p>;

  return (
    <div>
      <div className="page-title">
        <h1>{t('dashboard.title')}</h1>
        <p className="muted">{me.name} · {t(`admin.roles.${me.role}`)}</p>
      </div>

      <section className="card">
        <h2>{t('dashboard.myOrders')}</h2>
        {!orders.length && empty}
        <ul className="list">
          {orders.map((o) => (
            <li key={o.id}>
              <Link className="grow" href={`/orders/${o.id}`}>{o.project.title}</Link>
              <span>{formatMoney(o.amountMinor, o.currency, locale)}</span>
              <StatusBadge status={o.status} label={t(`orders.status.${o.status}`)} />
            </li>
          ))}
        </ul>
      </section>

      {me.role === 'EMPLOYER' && (
        <section className="card">
          <h2>{t('dashboard.myProjects')}</h2>
          {!projects.length && empty}
          <ul className="list">
            {projects.map((p) => (
              <li key={p.id}>
                <Link className="grow" href={`/projects/${p.id}`}>{p.title}</Link>
                <span className="muted small">{t('projects.proposals', { count: p._count.proposals })}</span>
                <StatusBadge status={p.status} label={t(`projects.status.${p.status}`)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {me.role === 'FREELANCER' && (
        <section className="card">
          <h2>{t('dashboard.myProposals')}</h2>
          {!proposals.length && empty}
          <ul className="list">
            {proposals.map((p) => (
              <li key={p.id}>
                <Link className="grow" href={`/projects/${p.project.id}`}>{p.project.title}</Link>
                <span>{formatMoney(p.priceMinor, p.currency, locale)}</span>
                <StatusBadge status={p.status} label={t(`proposals.status.${p.status}`)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
