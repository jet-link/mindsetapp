"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

export default function LoginCta() {
  const { t } = useTranslation("auth");
  return (
    <div className="login-cta" role="region" aria-label={t("ctaRegion")}>
      <div className="login-cta__inner">
        <span className="login-cta__text">{t("ctaText")}</span>
        <div className="login-cta__actions">
          <Link href="/login" className="btn">
            {t("login")}
          </Link>
          <Link href="/login?mode=signup" className="btn btn--ghost">
            {t("signup")}
          </Link>
        </div>
      </div>
    </div>
  );
}
