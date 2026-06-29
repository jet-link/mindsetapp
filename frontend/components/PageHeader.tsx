"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { setMobileBackVisible } from "@/lib/mobile-back";
import { setPageTitle } from "@/components/RouteTitle";
import BackButton from "./BackButton";

export default function PageHeader({
  title,
  titleKey,
  showBack = true,
}: {
  title?: string;
  /** Ключ перевода (namespace:key) — для server-компонентов без хука. */
  titleKey?: string;
  showBack?: boolean;
}) {
  const { t } = useTranslation();
  const resolvedTitle = titleKey ? t(titleKey) : title;
  useEffect(() => {
    if (resolvedTitle) setPageTitle(resolvedTitle);
  }, [resolvedTitle]);

  useEffect(() => {
    setMobileBackVisible(showBack);
    return () => setMobileBackVisible(false);
  }, [showBack]);

  return (
    <div className="page-toolbar">
      {showBack && <BackButton className="page-toolbar__back" />}
      {resolvedTitle && <span className="page-title">{resolvedTitle}</span>}
    </div>
  );
}
