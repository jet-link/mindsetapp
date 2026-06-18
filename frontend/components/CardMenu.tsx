"use client";

import { useEffect, useRef, useState } from "react";
import { AUTH_EVENT, getStoredUsername, isLoggedIn } from "@/lib/api";

type Kind = "theme" | "reply";

export default function CardMenu({
  kind,
  path,
  authorUsername,
}: {
  kind: Kind;
  path: string;
  authorUsername: string;
}) {
  const [open, setOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [isOwn, setIsOwn] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const copyLabel = kind === "theme" ? "Copy theme link" : "Copy reply link";
  const copiedLabel = kind === "theme" ? "Theme link was copied!" : "Reply link was copied!";

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

  return (
    <div className="card-menu" ref={rootRef}>
      <button
        type="button"
        className="card-menu__trigger"
        aria-label="More actions"
        title="More actions"
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
            <i className="fa fa-link" aria-hidden="true" />
            {copyLabel}
          </button>
          {authed && !isOwn && (
            <button
              type="button"
              className="card-menu__item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <i className="fa fa-flag-o" aria-hidden="true" />
              Report
            </button>
          )}
        </div>
      )}

      {copiedToast && (
        <div className="copy-overlay" role="status">
          <div className="copy-overlay__box">{copiedLabel}</div>
        </div>
      )}
    </div>
  );
}
