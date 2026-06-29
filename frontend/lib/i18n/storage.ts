// Локальное хранение выбранного языка (по образцу lib/theme.ts).
// Для гостя это единственный источник; у авторизованного пользователя при входе
// синхронизируется с профилем (User.language) на сервере.

import { DEFAULT_LOCALE, isLocale, type Locale } from "./languages";

export const LOCALE_STORAGE_KEY = "mindset-locale";
export const LOCALE_CHANGE_EVENT = "mindset:locale-change";

/** Возвращает сохранённый язык или язык по умолчанию (en). */
export function getStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Сохраняет язык в localStorage (без побочных эффектов на i18next). */
export function persistLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // localStorage может быть недоступен (приватный режим) — не критично.
  }
}

/** Оповещает остальные инстансы переключателя о смене языка. */
export function emitLocaleChange(locale: Locale): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<Locale>(LOCALE_CHANGE_EVENT, { detail: locale }),
  );
}
