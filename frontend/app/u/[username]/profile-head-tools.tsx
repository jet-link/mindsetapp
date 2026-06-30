"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AUTH_EVENT, getStoredUsername, isLoggedIn } from "@/lib/api";

export default function ProfileHeadTools({
  username,
}: {
  username: string;
}) {
  const { t } = useTranslation("profile");
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [showPlaneBtn, setShowPlaneBtn] = useState(false);
  const [showBlockBtn, setShowBlockBtn] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      const authed = isLoggedIn();
      const isOwn = getStoredUsername() === username;
      setShowPlaneBtn(authed && isOwn);
      setShowBlockBtn(authed && !isOwn);
    };
    sync();
    window.addEventListener(AUTH_EVENT, sync);
    return () => window.removeEventListener(AUTH_EVENT, sync);
  }, [username]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  function profileUrl() {
    return `${window.location.origin}/u/${username}`;
  }

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(profileUrl());
    } catch {
      // буфер недоступен — не критично
    }
    setMenuOpen(false);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 3500);
  }

  return (
    <div className="profile-head__tools" ref={rootRef}>
      <div className="card-menu">
        <button
          type="button"
          className="card-menu__trigger"
          aria-label={t("common:moreActions")}
          title={t("common:moreActions")}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="card-menu__dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        {menuOpen && (
          <div className="card-menu__panel" role="menu">
            <button
              type="button"
              className="card-menu__item"
              role="menuitem"
              onClick={copyProfileLink}
            >
              {t("copyProfileLink")}
            </button>
            {showBlockBtn && (
              <button
                type="button"
                className="card-menu__item card-menu__item--danger"
                role="menuitem"
                disabled
              >
                {t("block")}
              </button>
            )}
          </div>
        )}
      </div>

      {showPlaneBtn && (
        <button
          type="button"
          className="profile-head__tool-btn"
          aria-label={t("shareProfile")}
          title={t("shareProfile")}
        >
          <i className="fa-regular fa-paper-plane" aria-hidden="true" />
        </button>
      )}

      {copiedToast && (
        <div className="copy-overlay" role="status">
          <div className="copy-overlay__box">{t("profileLinkCopied")}</div>
        </div>
      )}
    </div>
  );
}
