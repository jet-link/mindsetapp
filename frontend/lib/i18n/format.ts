// Локализованное форматирование чисел и дат поверх Intl + словаря dates.
// Все функции читают активный язык из i18next, поэтому переключение языка
// автоматически меняет формат без изменения вызывающего кода.

import i18n from "./config";
import { DEFAULT_LOCALE, type Locale } from "./languages";

function activeLocale(): Locale {
  const lng = (i18n.language || DEFAULT_LOCALE).split("-")[0];
  return lng as Locale;
}

/** 1000 → "1,000" / "1 000" в зависимости от языка. */
export function formatNumber(value: number): string {
  try {
    return new Intl.NumberFormat(activeLocale()).format(value);
  } catch {
    return String(value);
  }
}

/** Компактная запись: 1500 → "1.5K" / "1,5 тыс." и т.п. */
export function formatCompactNumber(value: number): string {
  try {
    return new Intl.NumberFormat(activeLocale(), {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return String(value);
  }
}

/** Локализованная дата без года: "June 29" / "29 июня" / "29-iyun". */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(activeLocale(), {
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return d.toDateString();
  }
}

/** Локализованные дата и время: для строк уведомлений. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(activeLocale(), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/**
 * Относительная метка времени: "Right now", "2 min ago", "3 hr ago" и т.д.
 * Бакеты совпадают с серверными (apps/core/text.py), но формы множественного
 * числа берутся из словаря dates под активный язык.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const t = i18n.getFixedT(null, "dates");

  const secs = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (secs < 60) return t("rightNow");

  const mins = Math.floor(secs / 60);
  if (mins < 60) return t("minAgo", { count: mins });

  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("hrAgo", { count: hours });

  const days = Math.floor(hours / 24);
  if (days < 7) return t("dayAgo", { count: days });
  if (days < 30) return t("wkAgo", { count: Math.floor(days / 7) });
  if (days < 365) return t("moAgo", { count: Math.max(1, Math.floor(days / 30)) });

  return t("yrAgo", { count: Math.floor(days / 365) });
}
