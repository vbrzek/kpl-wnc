import { createI18n } from 'vue-i18n';
import cs from './locales/cs.json';
import en from './locales/en.json';
import ru from './locales/ru.json';
import uk from './locales/uk.json';
import es from './locales/es.json';

const SUPPORTED_LOCALES = ['cs', 'en', 'ru', 'uk', 'es'] as const;
type SupportedLocale = typeof SUPPORTED_LOCALES[number];

function detectLocale(): SupportedLocale {
  const stored = localStorage.getItem('locale') as SupportedLocale | null;
  if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
  const browserLang = navigator.language.slice(0, 2) as SupportedLocale;
  if (SUPPORTED_LOCALES.includes(browserLang)) return browserLang;
  return 'cs';
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'cs',
  messages: { cs, en, ru, uk, es },
  pluralRules: {
    cs: (count: number) => {
      if (count === 1) return 0;
      if (count >= 2 && count <= 4) return 1;
      return 2;
    },
    ru: (count: number) => {
      const m10 = count % 10;
      const m100 = count % 100;
      if (m10 === 1 && m100 !== 11) return 0;
      if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 1;
      return 2;
    },
    uk: (count: number) => {
      const m10 = count % 10;
      const m100 = count % 100;
      if (m10 === 1 && m100 !== 11) return 0;
      if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 1;
      return 2;
    },
  },
});
