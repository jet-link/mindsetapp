"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Avatar from "@/components/Avatar";
import {
  NotificationItem,
  USER_PROFILE_EVENT,
  UserProfileUpdatedDetail,
  clearNotifications,
  emitNotificationsChanged,
  getNotifications,
  isLoggedIn,
  markAllNotificationsRead,
} from "@/lib/api";
import { patchNotificationActors } from "@/lib/user-avatar-store";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";

function verbText(n: NotificationItem): string {
  if (n.verb === "repost") return "reposted your theme";
  return "replied to your theme";
}

function targetHref(n: NotificationItem): string | null {
  if (n.verb === "reply" && n.reply_id) return `/reply/${n.reply_id}`;
  if (n.theme_id) return `/thread/${n.theme_id}`;
  return null;
}

export default function NotificationsPage() {
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
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

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
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    return () => window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
  }, []);

  async function onReadAll() {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      emitNotificationsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark as read");
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
      setError(e instanceof Error ? e.message : "Failed to clear notifications");
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
      <PageHeader title="Notifications" showBack={false} />

      <div className="notif-actions">
        <button
          type="button"
          className="btn btn--ghost notif-actions__btn"
          onClick={onReadAll}
          disabled={readAllDisabled}
        >
          Read all
        </button>
        <button
          type="button"
          className="btn btn--ghost notif-actions__btn"
          onClick={onClear}
          disabled={clearDisabled}
        >
          Clear notifications
        </button>
      </div>

      {error && <p className="muted">{error}</p>}
      {loading && items.length === 0 && <p className="muted">Loading…</p>}
      {!loading && items.length === 0 && !error && (
        <p className="muted">No notifications yet.</p>
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
                  {verbText(n)}
                </p>
                {href && (
                  <Link href={href} className="notif-row__link">
                    View
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {nextCursor && (
        <>
          <div ref={sentinelRef} className="feed-sentinel" aria-hidden="true" />
          {loading && items.length > 0 && <p className="muted">Loading…</p>}
          {!loading && (
            <p className="muted">
              <button className="link-btn" onClick={() => load(nextCursor)}>
                Show more
              </button>
            </p>
          )}
        </>
      )}
    </main>
  );
}
