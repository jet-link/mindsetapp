"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { usePageScrollLock } from "@/lib/body-scroll-lock";

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
  const { t } = useTranslation("common");
  usePageScrollLock(open);

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
          aria-label={t("close")}
        >
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
