export * from './roles';
export * from './commission';
export * from './legal';

export const LOCALES = ['ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ru';
export const DEFAULT_CURRENCY = 'KGS';
