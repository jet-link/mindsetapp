"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ThemeCard from "@/components/ThemeCard";
import Composer from "@/components/Composer";
import LoginCta from "@/components/LoginCta";
import {
  AUTH_EVENT,
  REPLY_CREATED_EVENT,
  ReplyCreatedDetail,
  THEME_CREATED_EVENT,
  THEME_LIKE_EVENT,
  THEME_REPOST_EVENT,
  ThemeLikeDetail,
  ThemeRepostDetail,
  USER_PROFILE_EVENT,
  UserProfileUpdatedDetail,
  FeedTab,
  Theme,
  getFeed,
  isLoggedIn,
} from "@/lib/api";
import {
  getFeedCache,
  setFeedCache,
  getLastFeedTab,
  setLastFeedTab,
} from "@/lib/feed-cache";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { patchThemeAuthors } from "@/lib/user-avatar-store";

type WallTab = "for-you" | "following";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function normalizeTab(tab: string): WallTab {
  return tab === "following" ? "following" : "for-you";
}

export default function Feed() {
  const router = useRouter();
  const initialTab = normalizeTab(getLastFeedTab());
  const initialCache = getFeedCache(initialTab);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<WallTab>(initialTab);
  const [themes, setThemes] = useState<Theme[]>(initialCache?.themes ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCache?.nextCursor ?? null);
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState("");
  const restoredRef = useRef(false);
  const tabRef = useRef<WallTab>(initialTab);
  tabRef.current = tab;

  const load = useCallback(async (activeTab: WallTab, cursor?: string) => {
    setLoading(true);
    setError("");
    try {
      const page = await getFeed(activeTab as FeedTab, cursor);
      // Гонка: пользователь мог переключить вкладку, пока летел запрос.
      if (tabRef.current !== activeTab) return;
      const next = page.next
        ? new URL(page.next, "http://x").searchParams.get("cursor")
        : null;
      setThemes((prev) => (cursor ? [...prev, ...page.results] : page.results));
      setNextCursor(next);
    } catch (e) {
      if (tabRef.current !== activeTab) return;
      setError(e instanceof Error ? e.message : "Failed to load the feed");
    } finally {
      if (tabRef.current === activeTab) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setAuthed(isLoggedIn());
  }, []);

  // Первичная загрузка активной вкладки (если нет кэша после возврата).
  useEffect(() => {
    const cache = getFeedCache(tab);
    if (cache && cache.themes.length) return;
    load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchTab(nextTab: WallTab) {
    if (nextTab === tab) return;
    if (nextTab === "following" && !isLoggedIn()) {
      router.push("/login");
      return;
    }
    // Сохраняем прокрутку текущей вкладки перед уходом с неё.
    const current = getFeedCache(tab);
    if (current) current.scrollY = window.scrollY;

    setLastFeedTab(nextTab);
    setTab(nextTab);
    setError("");

    const cached = getFeedCache(nextTab);
    if (cached && cached.themes.length) {
      setThemes(cached.themes);
      setNextCursor(cached.nextCursor);
      setLoading(false);
      restoredRef.current = false;
    } else {
      setThemes([]);
      setNextCursor(null);
      window.scrollTo(0, 0);
      load(nextTab);
    }
  }

  // После входа/выхода кэш сброшен — перезагружаем ленту с корректными is_liked.
  useEffect(() => {
    const onAuth = () => {
      const nowAuthed = isLoggedIn();
      setAuthed(nowAuthed);
      restoredRef.current = false;
      let next = tabRef.current;
      if (next === "following" && !nowAuthed) next = "for-you";
      setLastFeedTab(next);
      setTab(next);
      setThemes([]);
      setNextCursor(null);
      load(next);
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [load]);

  useEffect(() => {
    const onThemeLike = (e: Event) => {
      const { themeId, liked, likes_count } = (e as CustomEvent<ThemeLikeDetail>).detail;
      setThemes((prev) =>
        prev.map((t) =>
          t.id === themeId ? { ...t, is_liked: liked, likes_count } : t,
        ),
      );
    };
    const onThemeRepost = (e: Event) => {
      const { themeId, reposted, reposts_count } = (e as CustomEvent<ThemeRepostDetail>).detail;
      setThemes((prev) =>
        prev.map((t) =>
          t.id === themeId ? { ...t, is_reposted: reposted, reposts_count } : t,
        ),
      );
    };
    window.addEventListener(THEME_LIKE_EVENT, onThemeLike);
    window.addEventListener(THEME_REPOST_EVENT, onThemeRepost);
    return () => {
      window.removeEventListener(THEME_LIKE_EVENT, onThemeLike);
      window.removeEventListener(THEME_REPOST_EVENT, onThemeRepost);
    };
  }, []);

  useEffect(() => {
    const cache = getFeedCache(tab);
    setFeedCache(tab, { themes, nextCursor, scrollY: cache?.scrollY ?? 0 });
  }, [themes, nextCursor, tab]);

  useEffect(() => {
    const onScroll = () => {
      const cache = getFeedCache(tabRef.current);
      if (cache) cache.scrollY = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onThemeCreated = (e: Event) => {
      const theme = (e as CustomEvent<Theme>).detail;
      setThemes((prev) => (prev.some((t) => t.id === theme.id) ? prev : [theme, ...prev]));
    };
    const onReplyCreated = (e: Event) => {
      const { themeId, themeRepliesCount } = (e as CustomEvent<ReplyCreatedDetail>).detail;
      setThemes((prev) =>
        prev.map((t) =>
          t.id === themeId ? { ...t, replies_count: themeRepliesCount } : t,
        ),
      );
    };
    const onProfileUpdated = (e: Event) => {
      const { username, avatar } = (e as CustomEvent<UserProfileUpdatedDetail>).detail;
      if (avatar === undefined) return;
      setThemes((prev) => patchThemeAuthors(prev, username, avatar));
    };
    window.addEventListener(THEME_CREATED_EVENT, onThemeCreated);
    window.addEventListener(REPLY_CREATED_EVENT, onReplyCreated);
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    return () => {
      window.removeEventListener(THEME_CREATED_EVENT, onThemeCreated);
      window.removeEventListener(REPLY_CREATED_EVENT, onReplyCreated);
      window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    };
  }, []);

  useIsoLayoutEffect(() => {
    const cache = getFeedCache(tab);
    if (!restoredRef.current && cache && cache.themes.length) {
      restoredRef.current = true;
      window.scrollTo(0, cache.scrollY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const sentinelRef = useInfiniteScroll({
    hasMore: !!nextCursor,
    loading,
    onLoadMore: () => {
      if (nextCursor) load(tab, nextCursor);
    },
  });

  const emptyText =
    tab === "following"
      ? "Follow people to see their themes here."
      : "Nothing here yet. Be the first!";

  return (
    <main>
      <PageHeader title="Main wall" showBack={false} />

      {authed === true && <Composer />}

      {authed === true && (
        <div className="tabs feed-tabs" role="tablist" aria-label="Feed">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "for-you"}
            className={tab === "for-you" ? "active" : ""}
            onClick={() => switchTab("for-you")}
          >
            For you
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "following"}
            className={tab === "following" ? "active" : ""}
            onClick={() => switchTab("following")}
          >
            Following
          </button>
        </div>
      )}

      {error && <p className="muted">{error}</p>}

      {!loading && !error && themes.length === 0 && (
        <p className="muted">{emptyText}</p>
      )}

      <div className="feed-list">
        {themes.map((t) => (
          <ThemeCard key={t.id} theme={t} />
        ))}
      </div>

      {loading && themes.length === 0 && <p className="muted">Loading…</p>}

      {nextCursor && (
        <>
          <div ref={sentinelRef} className="feed-sentinel" aria-hidden="true" />
          {loading && themes.length > 0 && <p className="muted">Loading…</p>}
          {!loading && (
            <p className="muted">
              <button className="link-btn" onClick={() => load(tab, nextCursor)}>
                Show more
              </button>
            </p>
          )}
        </>
      )}

      {authed === false && <LoginCta />}
    </main>
  );
}
