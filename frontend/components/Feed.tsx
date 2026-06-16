"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import ThemeCard from "@/components/ThemeCard";
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
  Theme,
  getFeed,
} from "@/lib/api";
import { getFeedCache, setFeedCache } from "@/lib/feed-cache";
import { patchThemeAuthors } from "@/lib/user-avatar-store";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function Feed() {
  const initialCache = getFeedCache();
  const [themes, setThemes] = useState<Theme[]>(initialCache?.themes ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCache?.nextCursor ?? null);
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState("");
  const restoredRef = useRef(false);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError("");
    try {
      const page = await getFeed("main", cursor);
      const next = page.next
        ? new URL(page.next, "http://x").searchParams.get("cursor")
        : null;
      setThemes((prev) => (cursor ? [...prev, ...page.results] : page.results));
      setNextCursor(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the feed");
    } finally {
      setLoading(false);
    }
  }, []);

  // При возврате (есть кэш) повторно не грузим — показываем сохранённое.
  useEffect(() => {
    const cache = getFeedCache();
    if (cache && cache.themes.length) return;
    load();
  }, [load]);

  // После входа/выхода кэш сброшен — перезагружаем ленту с корректными is_liked.
  useEffect(() => {
    const onAuth = () => {
      restoredRef.current = false;
      setThemes([]);
      setNextCursor(null);
      load();
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
    const cache = getFeedCache();
    setFeedCache({ themes, nextCursor, scrollY: cache?.scrollY ?? 0 });
  }, [themes, nextCursor]);

  useEffect(() => {
    const onScroll = () => {
      const cache = getFeedCache();
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
    const cache = getFeedCache();
    if (!restoredRef.current && cache && cache.themes.length) {
      restoredRef.current = true;
      window.scrollTo(0, cache.scrollY);
    }
  }, []);

  return (
    <main>
      <PageHeader title="Main wall" showBack={false} />

      {error && <p className="muted">{error}</p>}

      {!loading && !error && themes.length === 0 && (
        <p className="muted">Nothing here yet. Be the first!</p>
      )}

      <div className="feed-list">
        {themes.map((t) => (
          <ThemeCard key={t.id} theme={t} />
        ))}
      </div>

      {loading && themes.length === 0 && <p className="muted">Loading…</p>}

      {nextCursor && !loading && (
        <p className="muted">
          <button className="link-btn" onClick={() => load(nextCursor)}>
            Show more
          </button>
        </p>
      )}
    </main>
  );
}
