'use client';
import { calculateCommission } from '@fm/shared';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { StatusBadge } from '@/components/StatusBadge';
import { api, formatMoney } from '@/lib/api';
import { useMe } from '@/lib/useMe';

interface Proposal {
  id: string;
  coverLetter: string;
  priceMinor: number;
  currency: string;
  deadlineDays: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  freelancer: { id: string; name: string };
}

export function ProjectActions(props: { projectId: string; employerId: string; status: string; currency: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { me, loading } = useMe();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api<Proposal[]>(`/projects/${props.projectId}/proposals`).then(setProposals).catch(() => {});
  }, [props.projectId]);
  useEffect(() => { if (me) load(); }, [me, load]);

  if (loading) return null;
  const isOwner = me?.id === props.employerId;
  const isStaff = me?.role === 'ADMIN' || me?.role === 'MODERATOR';
  const isFreelancer = me?.role === 'FREELANCER';
  const mine = proposals.find((p) => p.freelancer.id === me?.id);
  const priceNum = Number(price);
  const preview = priceNum >= 1 ? calculateCommission(Math.round(priceNum * 100)) : null;

  async function sendProposal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const res = await api<{ contactsHidden?: boolean }>(`/projects/${props.projectId}/proposals`, {
        json: { coverLetter: f.get('coverLetter'), price: Number(f.get('price')), deadlineDays: Number(f.get('deadlineDays')) },
      });
      setMsg(res.contactsHidden ? `${t('proposals.sent')} ${t('common.contactsHidden')}` : t('proposals.sent'));
      load();
    } catch {
      setMsg(t('auth.errors.generic'));
    }
  }

  async function accept(id: string) {
    const order = await api<{ id: string }>(`/proposals/${id}/accept`, { method: 'POST' });
    router.push(`/orders/${order.id}`);
  }

  async function report() {
    const reason = prompt(t('projects.reportReason'));
    if (!reason) return;
    await api('/reports', { json: { projectId: props.projectId, reason } });
    alert(t('projects.reportSent'));
  }

  async function hide() {
    const reason = prompt(t('moderation.reason'));
    if (!reason) return;
    await api(`/moderation/projects/${props.projectId}/hide`, { json: { reason } });
    router.refresh();
  }

  return (
    <div className="stack">
      {!me && props.status === 'OPEN' && (
        <p className="notice" style={{ margin: 0 }}><Link href="/login">{t('proposals.loginToApply')}</Link></p>
      )}

      {isFreelancer && props.status === 'OPEN' && !mine && (
        <form className="card stack" onSubmit={sendProposal}>
          <h2 style={{ margin: 0 }}>{t('proposals.send')}</h2>
          <label>{t('proposals.coverLetter')}<textarea name="coverLetter" required minLength={20} /></label>
          <div className="grid2">
            <label>{t('proposals.price')}<input name="price" type="number" min={100} required value={price} onChange={(e) => setPrice(e.target.value)} /></label>
            <label>{t('proposals.deadlineDays')}<input name="deadlineDays" type="number" min={1} max={365} required /></label>
          </div>
          {preview && (
            <p className="hint" style={{ margin: 0 }}>
              {t('proposals.commissionHint', { rate: preview.rateBps / 100, payout: formatMoney(preview.payoutMinor, props.currency, locale) })}
            </p>
          )}
          {msg && <p style={{ margin: 0 }}>{msg}</p>}
          <div><button className="btn" type="submit">{t('proposals.send')}</button></div>
        </form>
      )}

      {(isOwner || isStaff || mine) && proposals.length > 0 && (
        <section>
          <h2>{t('proposals.title')}</h2>
          {proposals.map((p) => (
            <div key={p.id} className="card">
              <div className="row" style={{ marginBottom: 10 }}>
                <strong>{p.freelancer.name}</strong>
                <span>{formatMoney(p.priceMinor, p.currency, locale)}</span>
                <span className="muted small">{t('projects.deadline', { days: p.deadlineDays })}</span>
                <StatusBadge status={p.status} label={t(`proposals.status.${p.status}`)} />
              </div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{p.coverLetter}</p>
              <div className="row">
                {isOwner && p.status === 'PENDING' && props.status === 'OPEN' && (
                  <button className="btn" onClick={() => accept(p.id)}>{t('proposals.accept')}</button>
                )}
                {p.freelancer.id === me?.id && p.status === 'PENDING' && (
                  <button className="btn secondary" onClick={async () => { await api(`/proposals/${p.id}/withdraw`, { method: 'POST' }); load(); }}>
                    {t('proposals.withdraw')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="row end">
        {isOwner && props.status === 'OPEN' && (
          <button className="btn secondary sm" onClick={async () => { await api(`/projects/${props.projectId}/close`, { method: 'POST' }); router.refresh(); }}>
            {t('projects.close')}
          </button>
        )}
        {isStaff && props.status === 'OPEN' && <button className="btn danger sm" onClick={hide}>{t('moderation.hideProject')}</button>}
        {me && !isOwner && !isStaff && <button className="btn ghost sm" onClick={report}>{t('projects.report')}</button>}
      </div>
    </div>
  );
}
