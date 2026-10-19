'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';

interface Category { id: string; nameRu: string; nameEn: string }

export default function NewProjectPage() {
  const t = useTranslations('newProject');
  const tc = useTranslations('auth.errors');
  const locale = useLocale();
  const router = useRouter();
  const { me, loading } = useMe();
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Category[]>('/projects/categories').then(setCategories).catch(() => {});
  }, []);

  if (loading) return null;
  if (!me) {
    router.replace('/login');
    return null;
  }
  if (me.role !== 'EMPLOYER') return <p className="notice">{t('onlyEmployers')}</p>;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (f.get(k) ? Number(f.get(k)) : undefined);
    try {
      const p = await api<{ id: string }>('/projects', {
        json: {
          title: f.get('title'),
          description: f.get('description'),
          categoryId: f.get('categoryId') || undefined,
          budget: num('budget'),
          deadlineDays: num('deadlineDays'),
        },
      });
      router.push(`/projects/${p.id}`);
    } catch {
      setError(tc('generic'));
    }
  }

  return (
    <form className="card stack" style={{ maxWidth: 720, margin: '0 auto' }} onSubmit={onSubmit}>
      <h1 style={{ margin: 0 }}>{t('title')}</h1>
      <label>{t('fieldTitle')}<input name="title" required minLength={5} maxLength={150} /></label>
      <label>{t('fieldDescription')}<textarea name="description" required minLength={20} /></label>
      <label>
        {t('fieldCategory')}
        <select name="categoryId">
          <option value="">—</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{locale === 'en' ? c.nameEn : c.nameRu}</option>)}
        </select>
      </label>
      <div className="grid2">
        <label>{t('fieldBudget')}<input name="budget" type="number" min={100} /></label>
        <label>{t('fieldDeadline')}<input name="deadlineDays" type="number" min={1} max={365} /></label>
      </div>
      {error && <p className="error">{error}</p>}
      <div><button className="btn" type="submit">{t('submit')}</button></div>
    </form>
  );
}
