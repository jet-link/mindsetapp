"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/PageHeader";
import Avatar from "@/components/Avatar";
import {
  NotificationItem,
  REPLY_DELETED_EVENT,
  ReplyDeletedDetail,
  THEME_REPOST_EVENT,
  ThemeRepostDetail,
  USER_PROFILE_EVENT,
  UserProfileUpdatedDetail,
  clearNotifications,
  emitNotificationsChanged,
  getNotifications,
  getStoredUsername,
  isLoggedIn,
  markAllNotificationsRead,
} from "@/lib/api";
import { formatDateTime } from "@/lib/i18n";
import { patchNotificationActors } from "@/lib/user-avatar-store";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";

function targetHref(n: NotificationItem): string | null {
  if (n.verb === "reply" && n.reply_id) {
    if (n.reply_parent_id) {
      return `/reply/${n.reply_parent_id}?reply=${n.reply_id}`;
    }
    if (n.theme_id) {
      return `/thread/${n.theme_id}?reply=${n.reply_id}`;
    }
  }
  if (n.theme_id) return `/thread/${n.theme_id}`;
  return null;
}

export default function NotificationsPage() {
  const { t } = useTranslation("notifications");
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError("");
    try {
      const page = await getNotifications(cursor);
      const next = page.next
        ? new URL(page.next, "http://x").searchParams.get("cursor")
        : null;
      setItems((prev) => (cursor ? [...prev, ...page.results] : page.results));
      setNextCursor(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    setReady(true);
    load();
  }, [load, router]);

  useEffect(() => {
    const onProfileUpdated = (e: Event) => {
      const { username, avatar } = (e as CustomEvent<UserProfileUpdatedDetail>).detail;
      if (avatar === undefined) return;
      setItems((prev) => patchNotificationActors(prev, username, avatar));
    };
    const onThemeRepost = (e: Event) => {
      const { themeId, reposted } = (e as CustomEvent<ThemeRepostDetail>).detail;
      if (reposted) return;
      const actor = getStoredUsername();
      if (!actor) return;
      setItems((prev) =>
        prev.filter(
          (n) => !(n.verb === "repost" && n.theme_id === themeId && n.actor.username === actor),
        ),
      );
      emitNotificationsChanged();
    };
    const onReplyDeleted = (e: Event) => {
      const { replyId } = (e as CustomEvent<ReplyDeletedDetail>).detail;
      setItems((prev) => prev.filter((n) => !(n.verb === "reply" && n.reply_id === replyId)));
      emitNotificationsChanged();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    window.addEventListener(THEME_REPOST_EVENT, onThemeRepost);
    window.addEventListener(REPLY_DELETED_EVENT, onReplyDeleted);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
      window.removeEventListener(THEME_REPOST_EVENT, onThemeRepost);
      window.removeEventListener(REPLY_DELETED_EVENT, onReplyDeleted);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  async function onReadAll() {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      emitNotificationsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failedToMarkRead"));
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setBusy(true);
    try {
      await clearNotifications();
      setItems([]);
      setNextCursor(null);
      emitNotificationsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failedToClear"));
    } finally {
      setBusy(false);
    }
  }

  const sentinelRef = useInfiniteScroll({
    hasMore: !!nextCursor,
    loading,
    onLoadMore: () => {
      if (nextCursor) load(nextCursor);
    },
  });

  const hasItems = items.length > 0;
  const hasUnread = items.some((n) => !n.is_read);
  const readAllDisabled = busy || !hasItems || !hasUnread;
  const clearDisabled = busy || !hasItems;

  if (!ready) return null;

  return (
    <main>
      <PageHeader title={t("title")} showBack={false} />

      <div className="notif-actions">
        <button
          type="button"
          className="btn btn--ghost notif-actions__btn"
          onClick={onReadAll}
          disabled={readAllDisabled}
        >
          {t("readAll")}
        </button>
        <button
          type="button"
          className="btn btn--ghost notif-actions__btn"
          onClick={onClear}
          disabled={clearDisabled}
        >
          {t("clearAll")}
        </button>
      </div>

      {error && <p className="muted">{error}</p>}
      {loading && items.length === 0 && <p className="muted">{t("common:loading")}</p>}
      {!loading && items.length === 0 && !error && (
        <p className="muted">{t("noNotifications")}</p>
      )}

      <div className="notif-list">
        {items.map((n) => {
          const href = targetHref(n);
          return (
            <div key={n.id} className={`notif-row${n.is_read ? "" : " notif-row--unread"}`}>
              <Link href={`/u/${n.actor.username}`} className="notif-row__avatar">
                <Avatar username={n.actor.username} src={n.actor.avatar} />
              </Link>
              <div className="notif-row__main">
                <p>
                  <Link href={`/u/${n.actor.username}`} className="username">
                    {n.actor.username}
                  </Link>{" "}
                  {n.verb === "repost" ? t("repostedTheme") : t("repliedToTheme")}
                </p>
                <time className="notif-row__time" dateTime={n.created_at}>
                  {formatDateTime(n.created_at)}
                </time>
              </div>
              {href && (
                <Link href={href} className="notif-row__action">
                  {t("view")}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {nextCursor && (
        <>
          <div ref={sentinelRef} className="feed-sentinel" aria-hidden="true" />
          {loading && items.length > 0 && <p className="muted">{t("common:loading")}</p>}
          {!loading && (
            <p className="muted">
              <button className="link-btn" onClick={() => load(nextCursor)}>
                {t("common:showMore")}
              </button>
            </p>
          )}
        </>
      )}
    </main>
  );
}
