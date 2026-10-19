import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { LEGAL_DOCS } from '@/lib/legal';

export function Footer() {
  const t = useTranslations();
  return (
    <footer className="site">
      <div className="container">
        <div className="links">
          {LEGAL_DOCS.map((doc) => (
            <Link key={doc} href={`/legal/${doc}`}>{t(`legal.${doc}`)}</Link>
          ))}
        </div>
        <div>{t('footer.rights', { year: new Date().getFullYear() })}</div>
      </div>
    </footer>
  );
}
