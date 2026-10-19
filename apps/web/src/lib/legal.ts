export const LEGAL_DOCS = ['terms', 'offer', 'rules', 'safe-deal', 'privacy', 'cookies'] as const;
export type LegalDocKey = (typeof LEGAL_DOCS)[number];
