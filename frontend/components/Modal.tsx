"use client";

import { useEffect, type ReactNode } from "react";

export default function Modal({
  open,
  onClose,
  children,
  footer,
  ariaLabel,
  overlayVariant = "default",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  ariaLabel: string;
  overlayVariant?: "default" | "lightbox";
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`modal-overlay${
        overlayVariant === "lightbox" ? " modal-overlay--lightbox" : ""
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={ariaLabel}>
        <button
          type="button"
          className="close-btn modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          <i className="fa fa-times" aria-hidden="true" />
        </button>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
