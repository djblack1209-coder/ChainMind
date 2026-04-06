// ChainMind i18n Module
// Lightweight i18n with React Context, inspired by Cherry Studio / LobeHub pattern

import { create } from 'zustand';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';

export type Locale = 'zh-CN' | 'en';

const messages: Record<Locale, Record<string, any>> = {
  'zh-CN': zhCN,
  en,
};

export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
};

function getNestedValue(obj: Record<string, any>, path: string): string {
  const keys = path.split('.');
  let current: any = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return path;
    current = current[key];
  }
  return typeof current === 'string' ? current : path;
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function detectLocale(): Locale {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('chainmind-locale');
    if (saved && (saved === 'zh-CN' || saved === 'en')) return saved;
    const nav = navigator.language;
    if (nav.startsWith('zh')) return 'zh-CN';
  }
  return 'zh-CN';
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: detectLocale(),

  setLocale: (locale: Locale) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chainmind-locale', locale);
    }
    set({ locale });
  },

  t: (key: string, vars?: Record<string, string | number>) => {
    const { locale } = get();
    const msg = messages[locale] || messages['zh-CN'];
    const value = getNestedValue(msg, key);
    return vars ? interpolate(value, vars) : value;
  },
}));

// Convenience export for non-React usage
export function t(key: string, vars?: Record<string, string | number>): string {
  return useI18n.getState().t(key, vars);
}

export function getLocale(): Locale {
  return useI18n.getState().locale;
}

export function setLocale(locale: Locale): void {
  useI18n.getState().setLocale(locale);
}
