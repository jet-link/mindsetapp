"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AUTH_EVENT,
  deleteReply,
  deleteTheme,
  type ReplyDeletedDetail,
  getStoredUsername,
  isLoggedIn,
} from "@/lib/api";
import { isWithinDeleteWindow } from "@/lib/deletable";
import ReportContentModal from "@/components/ReportContentModal";

type Kind = "theme" | "reply";

export default function CardMenu({
  kind,
  path,
  authorUsername,
  itemId,
  createdAt,
  isDeletable,
  onDeleteStart,
  onDeleteSuccess,
  onDeleteFailed,
}: {
  kind: Kind;
  path: string;
  authorUsername: string;
  itemId: number;
  createdAt: string;
  isDeletable?: boolean;
  themeId?: number;
  parentId?: number | null;
  onDeleteStart?: () => void;
  onDeleteSuccess?: (replyDetail?: ReplyDeletedDetail) => void;
  onDeleteFailed?: () => void;
}) {
  const { t } = useTranslation("moderation");
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [isOwn, setIsOwn] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const copyLabel = kind === "theme" ? t("copyThemeLink") : t("copyReplyLink");
  const copiedLabel = kind === "theme" ? t("themeLinkCopied") : t("replyLinkCopied");
  const canDelete =
    isOwn && (isDeletable ?? isWithinDeleteWindow(createdAt));

  useEffect(() => {
    const syncAuth = () => {
      setAuthed(isLoggedIn());
      setIsOwn(getStoredUsername() === authorUsername);
    };
    syncAuth();
    window.addEventListener(AUTH_EVENT, syncAuth);
    return () => window.removeEventListener(AUTH_EVENT, syncAuth);
  }, [authorUsername]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function onCopy() {
    const url = `${window.location.origin + path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // буфер недоступен — не критично
    }
    setOpen(false);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 3500);
  }

  async function onDelete() {
    setOpen(false);
    onDeleteStart?.();
    try {
      if (kind === "theme") {
        await deleteTheme(itemId);
        onDeleteSuccess?.();
      } else {
        const r = await deleteReply(itemId);
        onDeleteSuccess?.({
          replyId: itemId,
          themeId: r.theme_id,
          parentId: r.parent_id,
          themeRepliesCount: r.theme_replies_count,
          parentRepliesCount: r.parent_replies_count,
        });
      }
    } catch {
      onDeleteFailed?.();
    }
  }

  return (
    <div className={`card-menu${open ? " card-menu--open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="card-menu__trigger"
        aria-label={t("common:moreActions")}
        title={t("common:moreActions")}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="card-menu__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {open && (
        <div className="card-menu__panel" role="menu">
          <button type="button" className="card-menu__item" role="menuitem" onClick={onCopy}>
            <i className="fa-solid fa-link" aria-hidden="true" />
            {copyLabel}
          </button>
          {authed && !isOwn && (
            <button
              type="button"
              className="card-menu__item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <i className="fa-solid fa-heart-circle-plus" aria-hidden="true" />
              {t("profile:follow")}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="card-menu__item card-menu__item--danger"
              role="menuitem"
              onClick={onDelete}
            >
              <i className="fa-regular fa-trash-can" aria-hidden="true" />
              {t("delete")}
            </button>
          )}
          {authed && !isOwn && (
            <button
              type="button"
              className="card-menu__item card-menu__item--danger"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setReportOpen(true);
              }}
            >
              <i className="fa-solid fa-bullhorn" aria-hidden="true" />
              {t("report")}
            </button>
          )}
        </div>
      )}

      {copiedToast && (
        <div className="copy-overlay" role="status">
          <div className="copy-overlay__box">{copiedLabel}</div>
        </div>
      )}

      <ReportContentModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        kind={kind}
      />
    </div>
  );
}
