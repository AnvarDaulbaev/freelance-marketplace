'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { StatusBadge } from '@/components/StatusBadge';
import { api, formatMoney } from '@/lib/api';
import { useMe } from '@/lib/useMe';

// ADMIN is granted only from the server CLI (npm run admin:create).
const ASSIGNABLE_ROLES = ['MODERATOR', 'EMPLOYER', 'FREELANCER'] as const;
interface UserRow { id: string; email: string; name: string; role: string; status: string; createdAt: string }
interface Stats { completedOrders: number; turnoverMinor: number; commissionMinor: number; users: { role: string; _count: number }[] }

export default function AdminPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { me, loading } = useMe();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    api<UserRow[]>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setUsers).catch(() => {});
  }, [q]);
  useEffect(() => {
    if (me?.role !== 'ADMIN') return;
    load();
    api<Stats>('/admin/stats').then(setStats).catch(() => {});
  }, [me, load]);

  if (loading) return null;
  if (me?.role !== 'ADMIN') {
    router.replace('/');
    return null;
  }

  async function setRole(id: string, role: string) {
    try {
      await api(`/admin/users/${id}/role`, { method: 'PATCH', json: { role } });
    } catch (e) {
      alert((e as Error).message);
    }
    load();
  }

  async function toggleBlock(u: UserRow) {
    if (u.status === 'ACTIVE') {
      const reason = prompt(t('moderation.reason'));
      if (!reason) return;
      await api(`/moderation/users/${u.id}/block`, { json: { reason } }).catch((e) => alert(e.message));
    } else {
      await api(`/moderation/users/${u.id}/unblock`, { json: {} }).catch((e) => alert(e.message));
    }
    load();
  }

  return (
    <div>
      <h1 className="page-title">{t('admin.title')}</h1>
      {stats && (
        <section className="grid4" style={{ marginBottom: 16 }}>
          <div className="card stat"><div className="label">{t('admin.completed')}</div><div className="value">{stats.completedOrders}</div></div>
          <div className="card stat"><div className="label">{t('admin.turnover')}</div><div className="value">{formatMoney(stats.turnoverMinor, 'KGS', locale)}</div></div>
          <div className="card stat"><div className="label">{t('admin.revenue')}</div><div className="value" style={{ color: 'var(--accent)' }}>{formatMoney(stats.commissionMinor, 'KGS', locale)}</div></div>
          <div className="card stat">
            <div className="label">{t('admin.usersByRole')}</div>
            <div className="small" style={{ marginTop: 6 }}>
              {stats.users.map((u) => <div key={u.role}>{t(`admin.roles.${u.role}`)}: <strong>{u._count}</strong></div>)}
            </div>
          </div>
        </section>
      )}
      <section className="card">
        <h2>{t('admin.users')}</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.search')} aria-label={t('admin.search')} style={{ marginBottom: 12 }} />
        <div className="table-wrap">
          <table>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      {u.name}
                      {u.status === 'BLOCKED' && <StatusBadge status="BLOCKED" label={t('moderation.status.BLOCKED')} />}
                    </div>
                    <div className="muted small">{u.email}</div>
                  </td>
                  <td>
                    {u.role === 'ADMIN' ? (
                      <span className="badge info">{t('admin.roles.ADMIN')}</span>
                    ) : (
                      <select value={u.role} onChange={(e) => setRole(u.id, e.target.value)} aria-label={t('admin.role')}>
                        {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {u.id !== me.id && u.role !== 'ADMIN' && (
                      <button className={u.status === 'ACTIVE' ? 'btn danger sm' : 'btn secondary sm'} onClick={() => toggleBlock(u)}>
                        {u.status === 'ACTIVE' ? t('moderation.blockUser') : t('moderation.unblockUser')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
