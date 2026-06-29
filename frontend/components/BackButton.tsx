"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

export default function BackButton({ className }: { className?: string }) {
  const router = useRouter();
  const { t } = useTranslation("common");

  return (
    <button
      type="button"
      className={className ? `back-btn ${className}` : "back-btn"}
      aria-label={t("goBack")}
      title={t("back")}
      onClick={() => {
        // history.back() мгновенно восстанавливает позицию скролла
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push("/");
        }
      }}
    >
      <i className="fa fa-arrow-left" aria-hidden="true" />
    </button>
  );
}
