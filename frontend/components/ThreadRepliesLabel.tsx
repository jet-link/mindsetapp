"use client";

import { useTranslation } from "react-i18next";

export default function ThreadRepliesLabel() {
  const { t } = useTranslation("feed");
  return (
    <div className="thread-replies-label">
      <div className="thread-replies-label__line-col" aria-hidden="true">
        <span className="thread-replies-label__line" />
      </div>
      <p className="thread-replies-label__text">
        <span className="thread-replies-label__text-content">{t("replies")}</span>
      </p>
    </div>
  );
}
