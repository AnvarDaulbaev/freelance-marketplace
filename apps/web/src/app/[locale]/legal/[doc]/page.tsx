import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LEGAL_DOC_VERSIONS } from '@fm/shared';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LEGAL_DOCS, LegalDocKey } from '@/lib/legal';

export function generateStaticParams() {
  return LEGAL_DOCS.map((doc) => ({ doc }));
}

export default async function LegalPage({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  if (!LEGAL_DOCS.includes(doc as LegalDocKey)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('legal');
  const file = path.join(process.cwd(), 'content', 'legal', locale, `${doc}.md`);
  const text = await readFile(file, 'utf8').catch(() => null);
  if (!text) notFound();

  return (
    <article className="card legal">
      <p className="notice small">{t('draftWarning')}</p>
      <p className="muted small">{t('version', { version: LEGAL_DOC_VERSIONS[doc as LegalDocKey] })}</p>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </article>
  );
}
