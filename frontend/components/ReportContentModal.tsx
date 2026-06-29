"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { usePageScrollLock } from "@/lib/body-scroll-lock";

const OTHER_LIMIT = 500;

export const REPORT_REASONS = [
  { id: "spam", labelKey: "reasonSpam" },
  { id: "bullying", labelKey: "reasonBullying" },
  { id: "hate", labelKey: "reasonHate" },
  { id: "misinformation", labelKey: "reasonMisinformation" },
  { id: "violence", labelKey: "reasonViolence" },
  { id: "adult", labelKey: "reasonAdult" },
  { id: "scam", labelKey: "reasonScam" },
  { id: "copyright", labelKey: "reasonCopyright" },
] as const;

type ReportKind = "theme" | "reply";

export default function ReportContentModal({
  open,
  onClose,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  kind: ReportKind;
}) {
  const { t } = useTranslation("moderation");
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [mounted, setMounted] = useState(false);

  const title = kind === "theme" ? t("reportTheme") : t("reportReply");
  const otherOverLimit = other.length > OTHER_LIMIT;
  const canSubmit =
    (reason !== null || other.trim().length > 0) && !otherOverLimit;

  usePageScrollLock(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setReason(null);
      setOther("");
    }
  }, [open]);

  if (!open || !mounted) return null;

  function selectReason(id: string) {
    setReason(id);
    setOther("");
  }

  function onOtherFocus() {
    setReason(null);
  }

  function onOtherChange(value: string) {
    setReason(null);
    setOther(value);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
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
        <h2 className="surface-form-lightbox__title">{title}</h2>
        <form
          className="surface-form-card surface-form-card--report"
          onSubmit={submit}
          noValidate
        >
          <fieldset className="report-reasons">
            <legend className="sr-only">{t("reportReason")}</legend>
            <div className="report-reasons__grid">
              {REPORT_REASONS.map((item) => (
                <label key={item.id} className="report-radio">
                  <input
                    type="radio"
                    name="report-reason"
                    value={item.id}
                    checked={reason === item.id}
                    onChange={() => selectReason(item.id)}
                  />
                  <span className="report-radio__control" aria-hidden="true" />
                  <span className="report-radio__label">{t(item.labelKey)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="sr-only" htmlFor="report-content-other">
            {t("otherReason")}
          </label>
          <textarea
            id="report-content-other"
            className="surface-form-card__other"
            value={other}
            onFocus={onOtherFocus}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder={t("otherPlaceholder")}
            rows={3}
          />
          <div className="surface-form-card__footer">
            <button type="submit" className="btn" disabled={!canSubmit}>
              {t("report")}
            </button>
            <span
              className={
                otherOverLimit ? "bio-counter bio-counter--over" : "bio-counter"
              }
            >
              {other.length}/{OTHER_LIMIT}
            </span>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
