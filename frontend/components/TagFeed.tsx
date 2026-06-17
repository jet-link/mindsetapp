"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ThemeCard from "@/components/ThemeCard";
import {
  THEME_LIKE_EVENT,
  THEME_REPOST_EVENT,
  ThemeLikeDetail,
  ThemeRepostDetail,
  USER_PROFILE_EVENT,
  UserProfileUpdatedDetail,
  Theme,
  getTagThemes,
} from "@/lib/api";
import { setListKey } from "@/lib/return-anchor";
import { getTagCache, setTagCache } from "@/lib/tag-cache";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { useRestoreAnchor } from "@/lib/use-restore-anchor";
import { patchThemeAuthors } from "@/lib/user-avatar-store";

export default function TagFeed({ slug }: { slug: string }) {
  const initialCache = getTagCache(slug);
  const [themes, setThemes] = useState<Theme[]>(initialCache?.themes ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCache?.nextCursor ?? null);
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState("");
  const slugRef = useRef(slug);
  slugRef.current = slug;

  const listKey = `/tags/${slug}`;

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError("");
    try {
      const page = await getTagThemes(slugRef.current, cursor);
      const next = page.next
        ? new URL(page.next, "http://x").searchParams.get("cursor")
        : null;
      setThemes((prev) => (cursor ? [...prev, ...page.results] : page.results));
      setNextCursor(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load posts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setListKey(listKey);
  }, [listKey]);

  useRestoreAnchor(listKey, !loading && themes.length > 0);

  // При смене тега или возврате с детальной — кэш без повторной загрузки.
  useEffect(() => {
    const cache = getTagCache(slug);
    if (cache && cache.themes.length) {
      setThemes(cache.themes);
      setNextCursor(cache.nextCursor);
      setLoading(false);
      setError("");
      return;
    }
    setThemes([]);
    setNextCursor(null);
    setLoading(true);
    load();
  }, [slug, load]);

  useEffect(() => {
    setTagCache(slug, { themes, nextCursor, scrollY: 0 });
  }, [themes, nextCursor, slug]);

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
    const onProfileUpdated = (e: Event) => {
      const { username, avatar } = (e as CustomEvent<UserProfileUpdatedDetail>).detail;
      if (avatar === undefined) return;
      setThemes((prev) => patchThemeAuthors(prev, username, avatar));
    };
    window.addEventListener(THEME_LIKE_EVENT, onThemeLike);
    window.addEventListener(THEME_REPOST_EVENT, onThemeRepost);
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    return () => {
      window.removeEventListener(THEME_LIKE_EVENT, onThemeLike);
      window.removeEventListener(THEME_REPOST_EVENT, onThemeRepost);
      window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    };
  }, []);

  const sentinelRef = useInfiniteScroll({
    hasMore: !!nextCursor,
    loading,
    onLoadMore: () => {
      if (nextCursor) load(nextCursor);
    },
  });

  return (
    <>
      {error && <p className="muted">{error}</p>}
      {!loading && !error && themes.length === 0 && (
        <p className="muted">No posts with this tag yet.</p>
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
        </>
      )}
    </>
  );
}
