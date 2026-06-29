"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { usePageScrollLock } from "@/lib/body-scroll-lock";
import { THEME_BODY_LIMIT } from "@/lib/theme-body";

export default function ReportProblemModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation("settings");
  const [body, setBody] = useState("");
  const [mounted, setMounted] = useState(false);

  const overLimit = body.length > THEME_BODY_LIMIT;

  usePageScrollLock(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) setBody("");
  }, [open]);

  if (!open || !mounted) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || overLimit) return;
    onClose();
  }

  return createPortal(
    <div
      className="surface-form-lightbox"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="close-btn surface-form-lightbox__close"
        onClick={onClose}
        aria-label={t("common:close")}
      >
        <i className="fa fa-times" aria-hidden="true" />
      </button>
      <div
        className="surface-form-lightbox__stage"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <h2 className="surface-form-lightbox__title">{t("reportProblem")}</h2>
        <form className="surface-form-card" onSubmit={submit} noValidate>
          <label className="sr-only" htmlFor="report-problem-body">
            {t("problemDescription")}
          </label>
          <textarea
            id="report-problem-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("problemPlaceholder")}
            rows={6}
          />
          <div className="surface-form-card__footer">
            <div className="surface-form-card__footer-actions">
              <button
                type="submit"
                className="btn"
                disabled={!body.trim() || overLimit}
              >
                {t("send")}
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled
                title={t("attachComingSoon")}
                aria-label={t("attachFile")}
              >
                <i className="fa fa-paperclip" aria-hidden="true" />
              </button>
            </div>
            <span
              className={
                overLimit ? "bio-counter bio-counter--over" : "bio-counter"
              }
            >
              {body.length}/{THEME_BODY_LIMIT}
            </span>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
