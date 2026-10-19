/**
 * Legal documents the user must accept. Bump a version whenever the text
 * changes materially; users are then asked to accept the new version and the
 * acceptance is recorded in UserConsent (who, which version, when, IP).
 */
export const LegalDoc = {
  TERMS: 'terms',
  OFFER: 'offer',
  PRIVACY: 'privacy',
  RULES: 'rules',
  SAFE_DEAL: 'safe-deal',
  COOKIES: 'cookies',
} as const;
export type LegalDoc = (typeof LegalDoc)[keyof typeof LegalDoc];

export const LEGAL_DOC_VERSIONS: Record<LegalDoc, string> = {
  terms: '2026-10-19',
  offer: '2026-10-19',
  privacy: '2026-10-19',
  rules: '2026-10-19',
  'safe-deal': '2026-10-19',
  cookies: '2026-10-19',
};

/** Documents that must be accepted at sign-up. */
export const SIGNUP_REQUIRED_DOCS: LegalDoc[] = [
  LegalDoc.TERMS,
  LegalDoc.OFFER,
  LegalDoc.PRIVACY,
  LegalDoc.RULES,
];
