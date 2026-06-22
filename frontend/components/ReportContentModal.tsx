"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const OTHER_LIMIT = 500;

export const REPORT_REASONS = [
  { id: "spam", label: "Spam" },
  { id: "bullying", label: "Bullying or Harassment" },
  { id: "hate", label: "Hate Speech or Hate Symbols" },
  { id: "misinformation", label: "Misinformation" },
  { id: "violence", label: "Violence or Violent Content" },
  { id: "adult", label: "Adult or Sexual Content" },
  { id: "scam", label: "Scam or Fraud" },
  { id: "copyright", label: "Copyright Infringement" },
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
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [mounted, setMounted] = useState(false);

  const title = kind === "theme" ? "Report a theme" : "Report a reply";
  const canSubmit = reason !== null || other.trim().length > 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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
    setOther(value.slice(0, OTHER_LIMIT));
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
        aria-label="Close"
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
            <legend className="sr-only">Report reason</legend>
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
                  <span className="report-radio__label">{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="sr-only" htmlFor="report-content-other">
            Other reason
          </label>
          <textarea
            id="report-content-other"
            className="surface-form-card__other"
            value={other}
            onFocus={onOtherFocus}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder="Other…"
            rows={3}
            maxLength={OTHER_LIMIT}
          />
          <div className="surface-form-card__footer surface-form-card__footer--end">
            <span className="bio-counter">
              {other.length}/{OTHER_LIMIT}
            </span>
            <button type="submit" className="btn" disabled={!canSubmit}>
              Report
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
