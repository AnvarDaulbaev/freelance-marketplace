'use client';
import { use, useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/StatusBadge';
import { api, formatDate, formatMoney } from '@/lib/api';
import { useMe } from '@/lib/useMe';

interface Order {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
  commissionBps?: number;
  commissionMinor?: number;
  payoutMinor?: number;
  deadlineAt: string | null;
  autoAcceptAt: string | null;
  employerId: string;
  freelancerId: string;
  project: { id: string; title: string };
  employer: { name: string };
  freelancer: { name: string };
  events: { id: string; from: string | null; to: string; note: string | null; createdAt: string }[];
  reviews: { authorId: string }[];
}
interface Msg { id: string; body: string; createdAt: string; author: { id: string; name: string } }

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { me } = useMe();
  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Order>(`/orders/${id}`).then(setOrder).catch(() => setError(tc('notFound')));
    api<Msg[]>(`/orders/${id}/messages`).then(setMessages).catch(() => {});
  }, [id, tc]);
  useEffect(load, [load]);

  if (error) return <p>{error}</p>;
  if (!order || !me) return <p>{tc('loading')}</p>;

  const isEmployer = me.id === order.employerId;
  const isFreelancer = me.id === order.freelancerId;
  const s = order.status;
  const dt = (v: string | null) => formatDate(v, locale);

  async function act(path: string, body?: object) {
    try {
      await api(`/orders/${id}/${path}`, { json: body ?? {} });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const withPrompt = (path: string, label: string, field: string) => () => {
    const v = prompt(label);
    if (v) act(path, { [field]: v });
  };

  const canChat = isEmployer || isFreelancer;

  return (
    <div>
      <div className="page-title">
        <div className="row" style={{ marginBottom: 8 }}>
          <StatusBadge status={s} label={t(`status.${s}`)} />
          <span className="muted small">{order.employer.name} → {order.freelancer.name}</span>
        </div>
        <h1 style={{ margin: 0 }}>{order.project.title}</h1>
      </div>

      <div className="card">
        <div className="stats" style={{ marginBottom: 16 }}>
          <div className="stat"><div className="label">{t('amount')}</div><div className="value">{formatMoney(order.amountMinor, order.currency, locale)}</div></div>
          {order.commissionBps != null && (
            <>
              <div className="stat"><div className="label">{t('commission', { rate: order.commissionBps / 100 })}</div><div className="value">{formatMoney(order.commissionMinor, order.currency, locale)}</div></div>
              <div className="stat"><div className="label">{t('payout')}</div><div className="value" style={{ color: 'var(--accent)' }}>{formatMoney(order.payoutMinor, order.currency, locale)}</div></div>
            </>
          )}
          <div className="stat"><div className="label">{t('deadline')}</div><div>{dt(order.deadlineAt)}</div></div>
          {order.autoAcceptAt && <div className="stat"><div className="label">{t('autoAccept')}</div><div>{dt(order.autoAcceptAt)}</div></div>}
        </div>
        {s === 'AWAITING_PAYMENT' && <p className="notice small">{t('awaitingPaymentHint')}</p>}
        {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}
        <div className="row">
          {me.role === 'ADMIN' && s === 'AWAITING_PAYMENT' && <button className="btn" onClick={() => act('fund')}>{t('fund')}</button>}
          {isFreelancer && (s === 'IN_PROGRESS' || s === 'REVISION') && <button className="btn" onClick={() => act('submit')}>{t('submit')}</button>}
          {isEmployer && s === 'SUBMITTED' && <button className="btn" onClick={() => act('accept')}>{t('accept')}</button>}
          {isEmployer && s === 'SUBMITTED' && <button className="btn secondary" onClick={withPrompt('revision', t('revision'), 'note')}>{t('revision')}</button>}
          {canChat && s === 'COMPLETED' && !order.reviews.some((r) => r.authorId === me.id) && (
            <button
              className="btn secondary"
              onClick={() => {
                const rating = Number(prompt(`${t('rating')} (1-5)`));
                if (rating >= 1 && rating <= 5) act('review', { rating, text: prompt(t('review')) || undefined });
              }}
            >
              {t('review')}
            </button>
          )}
          <span style={{ flex: 1 }} />
          {((s === 'AWAITING_PAYMENT' && canChat) || (isFreelancer && (s === 'IN_PROGRESS' || s === 'REVISION'))) && (
            <button className="btn ghost sm" onClick={() => act('cancel')}>{t('cancel')}</button>
          )}
          {canChat && ['IN_PROGRESS', 'SUBMITTED', 'REVISION'].includes(s) && (
            <button className="btn danger sm" onClick={withPrompt('dispute', t('disputeReason'), 'reason')}>{t('dispute')}</button>
          )}
        </div>
      </div>

      <section className="card">
        <h2>{t('chat')}</h2>
        <p className="hint">{t('chatHint')}</p>
        <div className="messages" style={{ marginBottom: canChat ? 16 : 0 }}>
          {!messages.length && <p className="muted small" style={{ margin: 0 }}>{t('noMessages')}</p>}
          {messages.map((m) => (
            <div key={m.id} className={`message${m.author.id === me.id ? ' own' : ''}`}>
              <div className="meta"><strong>{m.author.name}</strong> · {dt(m.createdAt)}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
            </div>
          ))}
        </div>
        {canChat && (
          <form
            className="composer"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const body = new FormData(form).get('body');
              if (!body) return;
              await api(`/orders/${id}/messages`, { json: { body } });
              form.reset();
              load();
            }}
          >
            <input name="body" maxLength={5000} placeholder={t('messagePlaceholder')} aria-label={t('messagePlaceholder')} />
            <button className="btn" type="submit">{t('send')}</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2>{t('history')}</h2>
        <ul className="timeline">
          {order.events.map((e) => (
            <li key={e.id}>
              <span style={{ color: 'var(--text)' }}>{t(`status.${e.to}`)}</span> · {dt(e.createdAt)}
              {e.note && <div className="small">{e.note}</div>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
