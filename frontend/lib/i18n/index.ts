// Публичная точка входа для работы с языком приложения.

import i18n, { initI18n, loadLocaleResources } from "./config";
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

// Монотонный токен запросов смены языка. При быстрых кликах (ru→uz→…) применяется
// только самый последний выбор: устаревшие цепочки прерываются ДО мутации i18next,
// чтобы активный язык, его словарь и сохранённое значение всегда совпадали.
let switchToken = 0;

/**
 * Меняет язык приложения без перезагрузки страницы: при необходимости
 * лениво подгружает словарь, переключает i18next, обновляет <html> и сохраняет
 * выбор.
 *
 * Безопасно при параллельных вызовах: пока грузится словарь, пользователь мог
 * выбрать другой язык — в этом случае текущий вызов отменяется и i18next не трогает.
 *
 * Загруженные словари НЕ выгружаются: они занимают считанные килобайты, а любое
 * удаление бандла риском словить fallback на английский на уже смонтированных
 * компонентах (sidenav, текущая страница). Надёжность важнее микро-экономии памяти.
 */
export async function setLocale(
  locale: Locale,
  options: SetLocaleOptions = {},
): Promise<void> {
  const { persist = true, emit = true } = options;
  const token = ++switchToken;

  await loadLocaleResources(locale);
  if (token !== switchToken) return; // за время загрузки выбрали другой язык

  await i18n.changeLanguage(locale);
  if (token !== switchToken) return; // ещё раз проверяем после await

  applyDocumentLocale(locale);

  if (persist) persistLocale(locale);
  if (emit) emitLocaleChange(locale);
}
