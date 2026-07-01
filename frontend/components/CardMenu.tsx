"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AUTH_EVENT,
  deleteReply,
  deleteTheme,
  emitFollowChanged,
  FOLLOW_EVENT,
  type FollowChangedDetail,
  type ReplyDeletedDetail,
  getProfile,
  getStoredUsername,
  isLoggedIn,
  toggleFollow,
} from "@/lib/api";
import { isWithinDeleteWindow } from "@/lib/deletable";
import ReportContentModal from "@/components/ReportContentModal";

type Kind = "theme" | "reply";

export default function CardMenu({
  kind,
  path,
  authorUsername,
  initialAuthorFollowing,
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
  initialAuthorFollowing?: boolean;
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
  const [following, setFollowing] = useState(!!initialAuthorFollowing);
  const followFetchedRef = useRef(false);
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
    followFetchedRef.current = false;
    setFollowing(!!initialAuthorFollowing);
  }, [authorUsername, initialAuthorFollowing]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const card = root.closest(".card");
    const tools = root.closest(".profile-head__tools");
    // Карточка в ленте может быть обёрнута сразу в несколько .list-exit
    // (вкладка Following добавляет ещё один слой), и у каждого overflow: hidden
    // обрезал бы панель. Поднимаем и раскрываем overflow у всех предков.
    const listExits: Element[] = [];
    for (let node: Element | null = root; node; node = node.parentElement) {
      if (node.classList.contains("list-exit")) listExits.push(node);
    }

    if (open) {
      card?.classList.add("card--menu-open");
      tools?.classList.add("profile-head__tools--menu-open");
      listExits.forEach((el) => el.classList.add("list-exit--menu-open"));
    } else {
      card?.classList.remove("card--menu-open");
      tools?.classList.remove("profile-head__tools--menu-open");
      listExits.forEach((el) => el.classList.remove("list-exit--menu-open"));
    }

    return () => {
      card?.classList.remove("card--menu-open");
      tools?.classList.remove("profile-head__tools--menu-open");
      listExits.forEach((el) => el.classList.remove("list-exit--menu-open"));
    };
  }, [open]);

  useEffect(() => {
    const onFollow = (e: Event) => {
      const { profileUsername, following: nextFollowing } = (
        e as CustomEvent<FollowChangedDetail>
      ).detail;
      if (profileUsername === authorUsername && nextFollowing !== undefined) {
        setFollowing(nextFollowing);
      }
    };
    window.addEventListener(FOLLOW_EVENT, onFollow);
    return () => window.removeEventListener(FOLLOW_EVENT, onFollow);
  }, [authorUsername]);

  useEffect(() => {
    if (!open || isOwn || !authed || followFetchedRef.current) return;
    followFetchedRef.current = true;
    getProfile(authorUsername)
      .then((p) => setFollowing(p.is_following))
      .catch(() => {});
  }, [open, isOwn, authed, authorUsername]);

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

  async function onFollowToggle() {
    const optimistic = !following;
    setFollowing(optimistic);
    try {
      const r = await toggleFollow(authorUsername);
      setFollowing(r.following);
      const viewer = getStoredUsername() ?? undefined;
      emitFollowChanged({
        profileUsername: authorUsername,
        following: r.following,
        followers_count: r.followers_count,
        viewerUsername: viewer,
        viewer_following_count: r.following_count,
      });
    } catch {
      setFollowing(!optimistic);
      window.location.href = "/login";
    }
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
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="card-menu__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      <div
        className="card-menu__panel"
        role="menu"
        aria-hidden={!open}
      >
          <button type="button" className="card-menu__item" role="menuitem" tabIndex={open ? 0 : -1} onClick={onCopy}>
            <i className="fa-solid fa-link" aria-hidden="true" />
            {copyLabel}
          </button>
          {authed && !isOwn && (
            <button
              type="button"
              className="card-menu__item"
              role="menuitem"
              tabIndex={open ? 0 : -1}
              onClick={onFollowToggle}
            >
              <i
                key={following ? "unfollow" : "follow"}
                className={`fa-solid ${following ? "fa-heart-circle-minus" : "fa-heart-circle-plus"}`}
                aria-hidden="true"
              />
              {following ? t("profile:unfollow") : t("profile:follow")}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="card-menu__item card-menu__item--danger"
              role="menuitem"
              tabIndex={open ? 0 : -1}
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
              tabIndex={open ? 0 : -1}
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
