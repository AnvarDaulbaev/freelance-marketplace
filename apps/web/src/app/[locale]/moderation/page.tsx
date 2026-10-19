'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { StatusBadge } from '@/components/StatusBadge';
import { api, formatDate, formatMoney } from '@/lib/api';
import { useMe } from '@/lib/useMe';

interface Report {
  id: string;
  reason: string;
  createdAt: string;
  author: { name: string };
  targetUser: { id: string; name: string; status: string } | null;
  project: { id: string; title: string; status: string } | null;
}
interface Dispute {
  id: string;
  reason: string;
  order: { id: string; amountMinor: number; currency: string; project: { title: string }; employer: { name: string }; freelancer: { name: string } };
}
interface Audit { id: string; action: string; entityType: string; entityId: string; createdAt: string; actor: { name: string } | null }

export default function ModerationPage() {
  const t = useTranslations('moderation');
  const locale = useLocale();
  const router = useRouter();
  const { me, loading } = useMe();
  const [reports, setReports] = useState<Report[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);

  const load = useCallback(() => {
    api<Report[]>('/moderation/reports').then(setReports).catch(() => {});
    api<Dispute[]>('/moderation/disputes').then(setDisputes).catch(() => {});
    api<Audit[]>('/moderation/audit').then(setAudit).catch(() => {});
  }, []);
  useEffect(() => { if (me) load(); }, [me, load]);

  if (loading) return null;
  if (!me || (me.role !== 'ADMIN' && me.role !== 'MODERATOR')) {
    router.replace('/');
    return null;
  }

  const post = async (path: string, json: object = {}) => {
    try {
      await api(path, { json });
    } catch (e) {
      alert((e as Error).message);
    }
    load();
  };
  const withReason = (path: string) => () => {
    const reason = prompt(t('reason'));
    if (reason) post(path, { reason });
  };
  const resolve = (id: string, status: string) => () => {
    const resolution = prompt(t('resolution'));
    if (!resolution) return;
    const refund = status === 'RESOLVED_SPLIT' ? Number(prompt(t('refund'))) : undefined;
    post(`/moderation/disputes/${id}/resolve`, { status, resolution, refund });
  };

  const empty = <p className="muted" style={{ margin: 0 }}>{t('empty')}</p>;

  return (
    <div>
      <h1 className="page-title">{t('title')}</h1>

      <section className="card">
        <h2>{t('reports')}</h2>
        {!reports.length && empty}
        <ul className="list">
          {reports.map((r) => (
            <li key={r.id} style={{ display: 'block' }}>
              <div className="muted small">{r.author.name} · {formatDate(r.createdAt, locale)}</div>
              <p style={{ margin: '4px 0 8px' }}>{r.reason}</p>
              <div className="row small" style={{ marginBottom: 10 }}>
                {r.project && (
                  <>
                    <span className="muted">{t('project')}:</span>
                    <Link href={`/projects/${r.project.id}`}>{r.project.title}</Link>
                  </>
                )}
                {r.targetUser && (
                  <>
                    <span className="muted">{t('user')}:</span>
                    <span>{r.targetUser.name}</span>
                    <StatusBadge status={r.targetUser.status} label={t(`status.${r.targetUser.status}`)} />
                  </>
                )}
              </div>
              <div className="row">
                {r.project?.status === 'OPEN' && <button className="btn danger sm" onClick={withReason(`/moderation/projects/${r.project.id}/hide`)}>{t('hideProject')}</button>}
                {r.project?.status === 'HIDDEN' && <button className="btn secondary sm" onClick={() => post(`/moderation/projects/${r.project!.id}/unhide`)}>{t('unhideProject')}</button>}
                {r.targetUser?.status === 'ACTIVE' && <button className="btn danger sm" onClick={withReason(`/moderation/users/${r.targetUser.id}/block`)}>{t('blockUser')}</button>}
                {r.targetUser?.status === 'BLOCKED' && <button className="btn secondary sm" onClick={() => post(`/moderation/users/${r.targetUser!.id}/unblock`)}>{t('unblockUser')}</button>}
                <span style={{ flex: 1 }} />
                <button className="btn sm" onClick={() => post(`/moderation/reports/${r.id}`, { status: 'ACTIONED' })}>{t('actioned')}</button>
                <button className="btn secondary sm" onClick={() => post(`/moderation/reports/${r.id}`, { status: 'DISMISSED' })}>{t('dismiss')}</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>{t('disputes')}</h2>
        {!disputes.length && empty}
        <ul className="list">
          {disputes.map((d) => (
            <li key={d.id} style={{ display: 'block' }}>
              <div className="row" style={{ marginBottom: 4 }}>
                <Link href={`/orders/${d.order.id}`}>{d.order.project.title}</Link>
                <strong>{formatMoney(d.order.amountMinor, d.order.currency, locale)}</strong>
                <span className="muted small">{d.order.employer.name} → {d.order.freelancer.name}</span>
              </div>
              <p style={{ margin: '0 0 10px' }}>{d.reason}</p>
              <div className="row">
                <button className="btn secondary sm" onClick={resolve(d.id, 'RESOLVED_FOR_EMPLOYER')}>{t('resolveEmployer')}</button>
                <button className="btn secondary sm" onClick={resolve(d.id, 'RESOLVED_FOR_FREELANCER')}>{t('resolveFreelancer')}</button>
                <button className="btn secondary sm" onClick={resolve(d.id, 'RESOLVED_SPLIT')}>{t('resolveSplit')}</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>{t('audit')}</h2>
        <div className="table-wrap">
          <table>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(a.createdAt, locale)}</td>
                  <td>{a.actor?.name ?? 'system'}</td>
                  <td><span className="mono">{a.action}</span></td>
                  <td className="muted mono">{a.entityType} · {a.entityId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
