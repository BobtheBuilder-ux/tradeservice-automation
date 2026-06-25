import { en } from './en';
import { fr } from './fr';
import { es } from './es';

export const locales = {
  en,
  fr,
  es,
} as const;

export type Locale = keyof typeof locales;

export const defaultLocale: Locale = 'en';

export const languages: Locale[] = ['en', 'fr', 'es'];

export function getLocale(lang: string): Locale {
  if (lang in locales) {
    return lang as Locale;
  }
  return defaultLocale;
}
