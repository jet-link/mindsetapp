"use client";

import { useEffect, useState } from "react";

export default function ReportProblemModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) setBody("");
  }, [open]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    onClose();
  }

  return (
    <div
      className="report-problem-lightbox"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="close-btn report-problem-lightbox__close"
        onClick={onClose}
        aria-label="Close"
      >
        <i className="fa fa-times" aria-hidden="true" />
      </button>
      <div
        className="report-problem-lightbox__stage"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <h2 className="report-problem-lightbox__title">Report a problem</h2>
        <form className="report-problem-form" onSubmit={submit} noValidate>
          <label className="sr-only" htmlFor="report-problem-body">
            Problem description
          </label>
          <textarea
            id="report-problem-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Provide as much detail as possible…"
            rows={6}
          />
          <div className="report-problem-form__footer">
            <button
              type="button"
              className="icon-btn"
              disabled
              title="Attach — coming soon"
              aria-label="Attach file"
            >
              <i className="fa fa-paperclip" aria-hidden="true" />
            </button>
            <button type="submit" className="btn" disabled={!body.trim()}>
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
