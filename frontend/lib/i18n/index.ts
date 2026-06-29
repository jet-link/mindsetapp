// Публичная точка входа для работы с языком приложения.

import i18n, {
  freeUnusedLocales,
  initI18n,
  loadLocaleResources,
} from "./config";
import {
  DEFAULT_LOCALE,
  getTextDirection,
  isLocale,
  type Locale,
} from "./languages";
import { emitLocaleChange, getStoredLocale, persistLocale } from "./storage";

export { i18n, initI18n, loadLocaleResources, getStoredLocale };
export * from "./languages";
export * from "./storage";
export * from "./format";

/** Текущий активный язык i18next. */
export function getActiveLocale(): Locale {
  const lng = (i18n.language || DEFAULT_LOCALE).split("-")[0];
  return isLocale(lng) ? lng : DEFAULT_LOCALE;
}

/** Применяет язык к <html lang> и dir (готовность к RTL). */
export function applyDocumentLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("lang", locale);
  root.setAttribute("dir", getTextDirection(locale));
}

interface SetLocaleOptions {
  /** Сохранять ли выбор в localStorage (по умолчанию да). */
  persist?: boolean;
  /** Оповещать ли другие инстансы переключателя (по умолчанию да). */
  emit?: boolean;
}

/**
 * Меняет язык приложения без перезагрузки страницы: при необходимости
 * лениво подгружает словарь, переключает i18next, обновляет <html>, сохраняет
 * выбор и освобождает неиспользуемые словари.
 */
export async function setLocale(
  locale: Locale,
  options: SetLocaleOptions = {},
): Promise<void> {
  const { persist = true, emit = true } = options;

  await loadLocaleResources(locale);
  await i18n.changeLanguage(locale);
  applyDocumentLocale(locale);

  if (persist) persistLocale(locale);
  if (emit) emitLocaleChange(locale);

  freeUnusedLocales(locale);
}
