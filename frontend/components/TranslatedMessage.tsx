"use client";

import { useTranslation } from "react-i18next";

/**
 * Локализованное сообщение для server-компонентов, которые не могут
 * использовать хук перевода напрямую (например, fallback «не найдено»).
 */
export default function TranslatedMessage({
  ns,
  k,
  className = "muted",
}: {
  ns: string;
  k: string;
  className?: string;
}) {
  const { t } = useTranslation(ns);
  return <p className={className}>{t(k)}</p>;
}
