"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import ReplyCard from "@/components/ReplyCard";
import ListExitWrap from "@/components/ListExitWrap";
import ListEnterItem from "@/components/ListEnterItem";
import AnimatedTabBar from "@/components/AnimatedTabBar";
import ProfileMediaGrid from "@/components/ProfileMediaGrid";
import ThemeCard from "@/components/ThemeCard";
import {
  AUTH_EVENT,
  REPLY_CREATED_EVENT,
  REPLY_DELETED_EVENT,
  REPLY_LIKE_EVENT,
  REPLY_REPOST_EVENT,
  ReplyCreatedDetail,
  ReplyDeletedDetail,
  ReplyLikeDetail,
  ReplyRepostDetail,
  THEME_CREATED_EVENT,
  THEME_LIKE_EVENT,
  THEME_REPOST_EVENT,
  THEME_DELETED_EVENT,
  ThemeDeletedDetail,
  Theme,
  ThemeLikeDetail,
  ThemeRepostDetail,
  MediaItem,
  ProfileReply,
  ProfileRepost,
  Reply,
  USER_PROFILE_EVENT,
  UserProfileUpdatedDetail,
  emitReplyDeleted,
  emitThemeDeleted,
  getStoredUsername,
  getUserMedia,
  getUserReplies,
  getUserReposts,
  getUserThemes,
} from "@/lib/api";
import {
  ProfileTab,
  ProfileSlice,
  PROFILE_TABS,
  buildProfileReplyFromCreated,
  getProfileTabsCache,
  setProfileTabsCache,
} from "@/lib/profile-tabs-cache";
import { findReplyInAllCaches, findThemeInAllCaches } from "@/lib/theme-cache-lookup";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { useTabSwitchAnimation } from "@/lib/use-tab-switch-animation";
import {
  findReturnAnchorByPrefix,
  parseListKeySearchParams,
  setListKey,
} from "@/lib/return-anchor";
import { useRestoreAnchor } from "@/lib/use-restore-anchor";
import { patchThemeAuthors } from "@/lib/user-avatar-store";

const ALL_TABS: ProfileTab[] = PROFILE_TABS;

type TabSlice = ProfileSlice;

function emptyTabSlice(): TabSlice {
  return {
    themes: [],
    replies: [],
    media: [],
    reposts: [],
    nextCursor: null,
    loaded: false,
  };
}

function profileRepostKey(item: ProfileRepost): string {
  if (item.kind === "theme" && item.theme) return `theme:${item.theme.id}`;
  if (item.kind === "reply" && item.reply) return `reply:${item.reply.id}`;
  return "";
}

function dedupeReposts(items: ProfileRepost[]): ProfileRepost[] {
  const seen = new Set<string>();
  const out: ProfileRepost[] = [];
  for (const item of items) {
    const k = profileRepostKey(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** Склейка страниц медиа без дублей (по файлу/ключу). Порядок сохраняем. */
function dedupeMedia(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const m of items) {
    const k = m.url || m.key || String(m.id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

function emptySlices(): Record<ProfileTab, TabSlice> {
  return Object.fromEntries(
    ALL_TABS.map((id) => [id, emptyTabSlice()]),
  ) as Record<ProfileTab, TabSlice>;
}

function mapSlices(
  slices: Record<ProfileTab, TabSlice>,
  fn: (slice: TabSlice, tabId: ProfileTab) => TabSlice,
): Record<ProfileTab, TabSlice> {
  const next = { ...slices };
  for (const tabId of ALL_TABS) {
    next[tabId] = fn(slices[tabId], tabId);
  }
  return next;
}

function findThemeInSlices(
  slices: Record<ProfileTab, TabSlice>,
  themeId: number,
): Theme | null {
  for (const tabId of ALL_TABS) {
    const slice = slices[tabId];
    const theme = slice.themes.find((t) => t.id === themeId);
    if (theme) return theme;
    for (const reply of slice.replies) {
      if (reply.theme.id === themeId) return reply.theme;
    }
    const reposted = slice.reposts.find(
      (r) => r.kind === "theme" && r.theme?.id === themeId,
    );
    if (reposted?.theme) return reposted.theme;
  }
  return null;
}

function findReplyInSlices(
  slices: Record<ProfileTab, TabSlice>,
  replyId: number,
): Reply | null {
  for (const tabId of ALL_TABS) {
    const slice = slices[tabId];
    for (const reply of slice.replies) {
      if (reply.id === replyId) return reply;
    }
    const reposted = slice.reposts.find(
      (r) => r.kind === "reply" && r.reply?.id === replyId,
    );
    if (reposted?.reply) return reposted.reply;
  }
  return null;
}

function patchThemeRepostFlags(
  slices: Record<ProfileTab, TabSlice>,
  themeId: number,
  reposted: boolean,
  repostsCount: number,
): Record<ProfileTab, TabSlice> {
  return mapSlices(slices, (slice, tabId) => {
    const next = {
      ...slice,
      themes: slice.themes.map((t) =>
        t.id === themeId ? { ...t, is_reposted: reposted, reposts_count: repostsCount } : t,
      ),
      replies: slice.replies.map((r) =>
        r.theme.id === themeId
          ? {
              ...r,
              theme: { ...r.theme, is_reposted: reposted, reposts_count: repostsCount },
            }
          : r,
      ),
      reposts: slice.reposts.map((item) => {
        if (item.kind !== "theme" || item.theme?.id !== themeId) return item;
        return {
          ...item,
          theme: { ...item.theme, is_reposted: reposted, reposts_count: repostsCount },
        };
      }),
    };
    if (tabId === "reposts" && !reposted) {
      // Оставляем карточку в списке — удаление после exit-анимации в onExitComplete.
      return slice;
    }
    return next;
  });
}

function prependToRepostsSlice(
  slices: Record<ProfileTab, TabSlice>,
  item: ProfileRepost,
): Record<ProfileTab, TabSlice> {
  const repostsSlice = slices.reposts;
  // Не «достраиваем» незагруженный срез: пусть подтянет свежее с сервера.
  if (!repostsSlice.loaded) return slices;
  const key = profileRepostKey(item);
  const reposts = repostsSlice.reposts.some((r) => profileRepostKey(r) === key)
    ? repostsSlice.reposts.map((r) => (profileRepostKey(r) === key ? item : r))
    : [item, ...repostsSlice.reposts];
  return {
    ...slices,
    reposts: { ...repostsSlice, reposts },
  };
}

function prependThemeToSlice(
  slices: Record<ProfileTab, TabSlice>,
  theme: Theme,
): Record<ProfileTab, TabSlice> {
  const themesSlice = slices.themes;
  if (!themesSlice.loaded) return slices;
  if (themesSlice.themes.some((t) => t.id === theme.id)) return slices;
  return {
    ...slices,
    themes: {
      ...themesSlice,
      themes: [theme, ...themesSlice.themes],
    },
  };
}

function prependReplyToSlice(
  slices: Record<ProfileTab, TabSlice>,
  profileReply: ProfileReply,
): Record<ProfileTab, TabSlice> {
  const repliesSlice = slices.replies;
  if (!repliesSlice.loaded) return slices;
  if (repliesSlice.replies.some((r) => r.id === profileReply.id)) return slices;
  return {
    ...slices,
    replies: {
      ...repliesSlice,
      replies: [profileReply, ...repliesSlice.replies],
    },
  };
}

function patchReplyCountsInSlices(
  slices: Record<ProfileTab, TabSlice>,
  themeId: number,
  parentId: number | null,
  themeRepliesCount: number,
  parentRepliesCount?: number,
): Record<ProfileTab, TabSlice> {
  return mapSlices(slices, (slice) => ({
    ...slice,
    themes: slice.themes.map((t) =>
      t.id === themeId ? { ...t, replies_count: themeRepliesCount } : t,
    ),
    replies: slice.replies.map((r) => {
      let next = r;
      if (r.theme.id === themeId) {
        next = { ...next, theme: { ...next.theme, replies_count: themeRepliesCount } };
      }
      if (parentId != null && r.id === parentId && parentRepliesCount !== undefined) {
        next = { ...next, replies_count: parentRepliesCount };
      }
      return next;
    }),
    reposts: slice.reposts.map((item) => {
      if (item.kind === "theme" && item.theme?.id === themeId) {
        return { ...item, theme: { ...item.theme, replies_count: themeRepliesCount } };
      }
      if (
        item.kind === "reply" &&
        item.reply &&
        parentId != null &&
        item.reply.id === parentId &&
        parentRepliesCount !== undefined
      ) {
        return { ...item, reply: { ...item.reply, replies_count: parentRepliesCount } };
      }
      return item;
    }),
  }));
}

export interface ProfileCounts {
  themes: number;
  replies: number;
  media: number;
  reposts: number;
}

const EMPTY_TEXT_KEYS: Record<ProfileTab, string> = {
  themes: "noThemesYet",
  replies: "noRepliesYet",
  media: "noMediaYet",
  reposts: "noRepostsYet",
};

function resolveInitialTab(username: string): ProfileTab {
  const anchor = findReturnAnchorByPrefix(`/u/${username}?`);
  if (anchor) {
    const tab = parseListKeySearchParams(anchor.listKey).get("tab");
    if (tab && ALL_TABS.includes(tab as ProfileTab)) return tab as ProfileTab;
  }
  return "themes";
}

type InitialState = {
  tab: ProfileTab;
  slices: Record<ProfileTab, TabSlice>;
  loadingTab: ProfileTab | null;
};

function normalizeSlice(slice: TabSlice, tabId: ProfileTab): TabSlice {
  if (slice.reposts) return slice;
  if (tabId === "reposts" && slice.themes.length > 0) {
    return {
      ...slice,
      reposts: slice.themes.map((theme) => ({
        kind: "theme" as const,
        reposted_at: theme.created_at,
        theme,
        reply: null,
      })),
    };
  }
  return { ...slice, reposts: [] };
}

function normalizeSlices(
  slices: Record<ProfileTab, TabSlice>,
): Record<ProfileTab, TabSlice> {
  const next = { ...slices };
  for (const tabId of ALL_TABS) {
    next[tabId] = normalizeSlice(slices[tabId] ?? emptyTabSlice(), tabId);
  }
  return next;
}

function resolveInitialState(username: string): InitialState {
  const cached = getProfileTabsCache(username);
  if (cached) {
    const tab = cached.tab;
    const slices = normalizeSlices(cached.slices);
    return {
      tab,
      slices,
      loadingTab: slices[tab].loaded ? null : tab,
    };
  }
  const tab = resolveInitialTab(username);
  return { tab, slices: emptySlices(), loadingTab: tab };
}

export default function ProfileTabs({
  username,
  counts,
}: {
  username: string;
  counts: ProfileCounts;
}) {
  const { t } = useTranslation("profile");
  const pathname = usePathname();
  const initial = resolveInitialState(username);
  const [tab, setTab] = useState<ProfileTab>(initial.tab);
  const [slices, setSlices] = useState<Record<ProfileTab, TabSlice>>(initial.slices);
  const [loadingTab, setLoadingTab] = useState<ProfileTab | null>(initial.loadingTab);
  const [error, setError] = useState("");
  const [tabCounts, setTabCounts] = useState(counts);
  const slicesRef = useRef(slices);
  const syncedUsername = useRef(username);
  const panelsRef = useRef<HTMLDivElement>(null);
  const lockedScrollY = useRef<number | null>(null);
  const scrollLocked = useRef(false);
  const programmaticScroll = useRef(false);
  const pendingThemeDeletes = useRef(new Set<number>());
  const pendingReplyDeletes = useRef(new Map<number, ReplyDeletedDetail>());
  const [exitingRepostIds, setExitingRepostIds] = useState<Set<string>>(() => new Set());
  const [exitingThemeIds, setExitingThemeIds] = useState<Set<number>>(() => new Set());
  const [exitingReplyIds, setExitingReplyIds] = useState<Set<number>>(() => new Set());
  const exitingThemeIdsRef = useRef(exitingThemeIds);
  const exitingReplyIdsRef = useRef(exitingReplyIds);

  slicesRef.current = slices;
  exitingThemeIdsRef.current = exitingThemeIds;
  exitingReplyIdsRef.current = exitingReplyIds;

  useEffect(() => {
    setTabCounts(counts);
  }, [username, counts]);

  const removeRepostFromSlice = useCallback((key: string) => {
    const hadRepost = slicesRef.current.reposts.reposts.some(
      (r) => profileRepostKey(r) === key,
    );
    setSlices((prev) =>
      mapSlices(prev, (slice, tabId) => {
        if (tabId !== "reposts") return slice;
        return {
          ...slice,
          reposts: slice.reposts.filter((r) => profileRepostKey(r) !== key),
        };
      }),
    );
    if (hadRepost) {
      setTabCounts((c) => ({ ...c, reposts: Math.max(0, c.reposts - 1) }));
    }
    setExitingRepostIds((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const cancelRepostRemove = useCallback((key: string) => {
    setExitingRepostIds((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const removeThemeFromSlice = useCallback((themeId: number) => {
    setSlices((prev) =>
      mapSlices(prev, (slice) => ({
        ...slice,
        themes: slice.themes.filter((t) => t.id !== themeId),
        replies: slice.replies.filter((r) => r.theme.id !== themeId),
        reposts: slice.reposts.filter(
          (r) => !(r.kind === "theme" && r.theme?.id === themeId),
        ),
      })),
    );
    setExitingThemeIds((prev) => {
      if (!prev.has(themeId)) return prev;
      const next = new Set(prev);
      next.delete(themeId);
      return next;
    });
  }, []);

  const scheduleThemeRemove = useCallback((themeId: number) => {
    setExitingThemeIds((prev) => {
      if (prev.has(themeId)) return prev;
      const next = new Set(prev);
      next.add(themeId);
      return next;
    });
  }, []);

  const cancelThemeRemove = useCallback((themeId: number) => {
    pendingThemeDeletes.current.delete(themeId);
    setExitingThemeIds((prev) => {
      if (!prev.has(themeId)) return prev;
      const next = new Set(prev);
      next.delete(themeId);
      return next;
    });
  }, []);

  const finishThemeRemove = useCallback(
    (themeId: number) => {
      if (pendingThemeDeletes.current.has(themeId)) {
        pendingThemeDeletes.current.delete(themeId);
        emitThemeDeleted({ themeId });
      }
      removeThemeFromSlice(themeId);
      setTabCounts((c) => ({ ...c, themes: Math.max(0, c.themes - 1) }));
    },
    [removeThemeFromSlice],
  );

  const removeReplyFromSlice = useCallback((replyId: number) => {
    setSlices((prev) =>
      mapSlices(prev, (slice) => ({
        ...slice,
        replies: slice.replies.filter((r) => r.id !== replyId),
      })),
    );
    setExitingReplyIds((prev) => {
      if (!prev.has(replyId)) return prev;
      const next = new Set(prev);
      next.delete(replyId);
      return next;
    });
  }, []);

  const scheduleReplyRemove = useCallback((replyId: number) => {
    setExitingReplyIds((prev) => {
      if (prev.has(replyId)) return prev;
      const next = new Set(prev);
      next.add(replyId);
      return next;
    });
  }, []);

  const cancelReplyRemove = useCallback((replyId: number) => {
    pendingReplyDeletes.current.delete(replyId);
    setExitingReplyIds((prev) => {
      if (!prev.has(replyId)) return prev;
      const next = new Set(prev);
      next.delete(replyId);
      return next;
    });
  }, []);

  const finishReplyRemove = useCallback(
    (replyId: number) => {
      const detail = pendingReplyDeletes.current.get(replyId);
      if (detail) {
        pendingReplyDeletes.current.delete(replyId);
        emitReplyDeleted(detail);
      }
      removeReplyFromSlice(replyId);
      setTabCounts((c) => ({ ...c, replies: Math.max(0, c.replies - 1) }));
    },
    [removeReplyFromSlice],
  );

  const scheduleRepostRemove = useCallback(
    (key: string) => {
      if (username !== getStoredUsername()) return;
      setExitingRepostIds((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    },
    [username],
  );

  const addRepostToSlice = useCallback(
    (item: ProfileRepost) => {
      if (username !== getStoredUsername()) return;
      setSlices((prev) => {
        const flagged =
          item.kind === "theme" && item.theme
            ? patchThemeRepostFlags(
                prev,
                item.theme.id,
                true,
                item.theme.reposts_count,
              )
            : item.kind === "reply" && item.reply
              ? mapSlices(prev, (slice) => ({
                  ...slice,
                  replies: slice.replies.map((r) =>
                    r.id === item.reply!.id
                      ? { ...r, is_reposted: true, reposts_count: item.reply!.reposts_count }
                      : r,
                  ),
                }))
              : prev;
        return prependToRepostsSlice(flagged, item);
      });
    },
    [username],
  );

  const removeThemeFromSlices = useCallback(
    (themeId: number) => {
      removeThemeFromSlice(themeId);
    },
    [removeThemeFromSlice],
  );

  const handleRepostChange = useCallback(
    (
      themeId: number,
      reposted: boolean,
      options?: { theme?: Theme; immediate?: boolean },
    ) => {
      if (username !== getStoredUsername()) return;
      const key = `theme:${themeId}`;
      if (reposted) {
        cancelRepostRemove(key);
        const theme =
          options?.theme ?? findThemeInSlices(slicesRef.current, themeId);
        if (theme) {
          addRepostToSlice({
            kind: "theme",
            reposted_at: new Date().toISOString(),
            theme: { ...theme, is_reposted: true },
            reply: null,
          });
        }
        return;
      }
      if (options?.immediate) removeRepostFromSlice(key);
      else scheduleRepostRemove(key);
    },
    [
      addRepostToSlice,
      cancelRepostRemove,
      removeRepostFromSlice,
      scheduleRepostRemove,
      username,
    ],
  );

  const handleReplyRepostChange = useCallback(
    (
      replyId: number,
      reposted: boolean,
      options?: { reply?: Reply; immediate?: boolean },
    ) => {
      if (username !== getStoredUsername()) return;
      const key = `reply:${replyId}`;
      if (reposted) {
        cancelRepostRemove(key);
        const reply =
          options?.reply ?? findReplyInSlices(slicesRef.current, replyId);
        if (reply) {
          addRepostToSlice({
            kind: "reply",
            reposted_at: new Date().toISOString(),
            theme: null,
            reply: { ...reply, is_reposted: true },
          });
        }
        return;
      }
      if (options?.immediate) removeRepostFromSlice(key);
      else scheduleRepostRemove(key);
    },
    [
      addRepostToSlice,
      cancelRepostRemove,
      removeRepostFromSlice,
      scheduleRepostRemove,
      username,
    ],
  );

  const applyScrollFloor = useCallback(() => {
    const el = panelsRef.current;
    const y = lockedScrollY.current;
    if (!el || y === null) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const minHeight = y + window.innerHeight - top;
    el.style.minHeight = `${Math.max(el.offsetHeight, minHeight)}px`;
  }, []);

  const restoreLockedScroll = useCallback(() => {
    if (findReturnAnchorByPrefix(`/u/${username}?`)) return;
    const y = lockedScrollY.current;
    if (!scrollLocked.current || y === null) return;
    applyScrollFloor();
    programmaticScroll.current = true;
    window.scrollTo(0, y);
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      programmaticScroll.current = false;
    });
  }, [applyScrollFloor]);

  const lockScrollPosition = useCallback(() => {
    const y = window.scrollY;
    lockedScrollY.current = y;
    scrollLocked.current = true;
    applyScrollFloor();
  }, [applyScrollFloor]);

  const unlockScroll = useCallback(() => {
    scrollLocked.current = false;
    lockedScrollY.current = null;
    if (panelsRef.current) panelsRef.current.style.minHeight = "";
  }, []);

  const load = useCallback(
    async (activeTab: ProfileTab, cursor?: string, force = false) => {
      if (!cursor && !force && slicesRef.current[activeTab].loaded) return;

      setLoadingTab(activeTab);
      setError("");
      try {
        if (activeTab === "replies") {
          const page = await getUserReplies(username, cursor);
          const nextCursor = page.next
            ? new URL(page.next, "http://x").searchParams.get("cursor")
            : null;
          setSlices((prev) => {
            const slice = prev.replies;
            return {
              ...prev,
              replies: {
                themes: [],
                replies: cursor ? [...slice.replies, ...page.results] : page.results,
                media: [],
                reposts: [],
                nextCursor,
                loaded: true,
              },
            };
          });
          return;
        }

        if (activeTab === "media") {
          const page = await getUserMedia(username, cursor);
          const nextCursor = page.next
            ? new URL(page.next, "http://x").searchParams.get("cursor")
            : null;
          setSlices((prev) => {
            const slice = prev.media;
            return {
              ...prev,
              media: {
                themes: [],
                replies: [],
                media: cursor
                  ? dedupeMedia([...slice.media, ...page.results])
                  : dedupeMedia(page.results),
                reposts: [],
                nextCursor,
                loaded: true,
              },
            };
          });
          return;
        }

        if (activeTab === "reposts") {
          const page = await getUserReposts(username, cursor);
          const nextCursor = page.next
            ? new URL(page.next, "http://x").searchParams.get("cursor")
            : null;
          setSlices((prev) => {
            const slice = prev.reposts;
            return {
              ...prev,
              reposts: {
                themes: [],
                replies: [],
                media: [],
                reposts: cursor
                  ? dedupeReposts([...slice.reposts, ...page.results])
                  : dedupeReposts(page.results),
                nextCursor,
                loaded: true,
              },
            };
          });
          return;
        }

        const page = await getUserThemes(username, cursor);
        const nextCursor = page.next
          ? new URL(page.next, "http://x").searchParams.get("cursor")
          : null;
        setSlices((prev) => {
          const slice = prev.themes;
          return {
            ...prev,
            themes: {
              themes: cursor ? [...slice.themes, ...page.results] : page.results,
              replies: [],
              media: [],
              reposts: [],
              nextCursor,
              loaded: true,
            },
          };
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : t("failedToLoadPosts"));
      } finally {
        setLoadingTab((currentTab) => (currentTab === activeTab ? null : currentTab));
      }
    },
    [username, t],
  );

  const switchTab = useCallback(
    (nextTab: ProfileTab) => {
      if (nextTab === tab) return;
      lockScrollPosition();
      setTab(nextTab);
    },
    [tab, lockScrollPosition],
  );

  useEffect(() => {
    if (syncedUsername.current === username) return;
    syncedUsername.current = username;
    unlockScroll();
    const cached = getProfileTabsCache(username);
    if (cached) {
      const slices = normalizeSlices(cached.slices);
      setTab(cached.tab);
      setSlices(slices);
      setLoadingTab(slices[cached.tab].loaded ? null : cached.tab);
      setExitingRepostIds(new Set());
      setExitingThemeIds(new Set());
      setExitingReplyIds(new Set());
      pendingThemeDeletes.current.clear();
      pendingReplyDeletes.current.clear();
      setError("");
      return;
    }
    setTab("themes");
    setSlices(emptySlices());
    setLoadingTab("themes");
    setExitingRepostIds(new Set());
    setExitingThemeIds(new Set());
    setExitingReplyIds(new Set());
    pendingThemeDeletes.current.clear();
    pendingReplyDeletes.current.clear();
    setError("");
    window.scrollTo(0, 0);
  }, [username, unlockScroll]);

  // После back-btn подтягиваем актуальные like/repost из кэша.
  useEffect(() => {
    if (!pathname.startsWith(`/u/${username}`)) return;
    const cached = getProfileTabsCache(username);
    if (!cached) return;
    setTab(cached.tab);
    setSlices(cached.slices);
    setLoadingTab(cached.slices[cached.tab].loaded ? null : cached.tab);
  }, [pathname, username]);

  // Сохраняем срез вкладок, чтобы возврат по back-btn не перезагружал страницу.
  useEffect(() => {
    if (syncedUsername.current !== username) return;
    setProfileTabsCache({ username, tab, slices });
  }, [username, tab, slices]);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  useLayoutEffect(() => {
    restoreLockedScroll();
  }, [tab, slices, loadingTab, restoreLockedScroll]);

  useEffect(() => {
    restoreLockedScroll();
  }, [tab, slices, loadingTab, restoreLockedScroll]);

  useEffect(() => {
    const unlockOnIntent = () => unlockScroll();

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        scrollLocked.current &&
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)
      ) {
        unlockScroll();
      }
    };

    window.addEventListener("wheel", unlockOnIntent, { passive: true });
    window.addEventListener("touchmove", unlockOnIntent, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("wheel", unlockOnIntent);
      window.removeEventListener("touchmove", unlockOnIntent);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [unlockScroll]);

  useEffect(() => {
    const onScroll = () => {
      if (programmaticScroll.current) return;

      if (scrollLocked.current && lockedScrollY.current !== null) {
        if (Math.abs(window.scrollY - lockedScrollY.current) > 1) {
          restoreLockedScroll();
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [restoreLockedScroll]);

  useEffect(() => {
    const onAuth = () => {
      unlockScroll();
      setTab("themes");
      setLoadingTab("themes");
      setSlices(emptySlices());
      load("themes", undefined, true);
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [load, unlockScroll]);

  useEffect(() => {
    const onProfileUpdated = (e: Event) => {
      const { username: changed, avatar } = (e as CustomEvent<UserProfileUpdatedDetail>).detail;
      if (avatar === undefined) return;
      setSlices((prev) =>
        mapSlices(prev, (slice) => ({
          ...slice,
          themes: patchThemeAuthors(slice.themes, changed, avatar),
          replies: slice.replies.map((r) => {
            let next = r;
            if (r.author.username === changed) {
              next = { ...next, author: { ...next.author, avatar } };
            }
            if (r.theme.author.username === changed) {
              next = {
                ...next,
                theme: { ...next.theme, author: { ...next.theme.author, avatar } },
              };
            }
            return next;
          }),
        })),
      );
    };
    const onThemeLike = (e: Event) => {
      const { themeId, liked, likes_count } = (e as CustomEvent<ThemeLikeDetail>).detail;
      setSlices((prev) =>
        mapSlices(prev, (slice) => ({
          ...slice,
          themes: slice.themes.map((t) =>
            t.id === themeId ? { ...t, is_liked: liked, likes_count } : t,
          ),
          replies: slice.replies.map((r) =>
            r.theme.id === themeId
              ? { ...r, theme: { ...r.theme, is_liked: liked, likes_count } }
              : r,
          ),
          // Срез reposts тоже держим в актуальном состоянии: иначе repost-патч
          // (patchThemeRepostFlags) пересоберёт карточку со старым is_liked и
          // через prop-sync вернёт лайку устаревшее значение.
          reposts: slice.reposts.map((item) =>
            item.kind === "theme" && item.theme?.id === themeId
              ? { ...item, theme: { ...item.theme, is_liked: liked, likes_count } }
              : item,
          ),
        })),
      );
    };
    const onThemeRepost = (e: Event) => {
      const { themeId, reposted, reposts_count } = (e as CustomEvent<ThemeRepostDetail>).detail;
      const isOwnProfile = username === getStoredUsername();
      const key = `theme:${themeId}`;
      if (!reposted && isOwnProfile) {
        scheduleRepostRemove(key);
      }
      const hadRepost =
        reposted &&
        isOwnProfile &&
        slicesRef.current.reposts.reposts.some(
          (r) => r.kind === "theme" && r.theme?.id === themeId,
        );
      setSlices((prev) => {
        let next = patchThemeRepostFlags(prev, themeId, reposted, reposts_count);
        if (reposted && isOwnProfile) {
          const source =
            findThemeInSlices(next, themeId) ?? findThemeInAllCaches(themeId);
          if (source) {
            next = prependToRepostsSlice(next, {
              kind: "theme",
              reposted_at: new Date().toISOString(),
              theme: { ...source, is_reposted: true, reposts_count },
              reply: null,
            });
          } else if (next.reposts.loaded) {
            // Темы нет в кэше — помечаем срез репостов на дозагрузку.
            next = { ...next, reposts: { ...next.reposts, loaded: false } };
          }
        }
        return next;
      });
      if (reposted && isOwnProfile && !hadRepost) {
        setTabCounts((c) => ({ ...c, reposts: c.reposts + 1 }));
      }
    };
    const onThemeCreated = (e: Event) => {
      const theme = (e as CustomEvent<Theme>).detail;
      if (username !== getStoredUsername() || theme.author.username !== username) return;
      setSlices((prev) => prependThemeToSlice(prev, theme));
      setTabCounts((c) => ({ ...c, themes: c.themes + 1 }));
    };
    const onReplyCreated = (e: Event) => {
      const detail = (e as CustomEvent<ReplyCreatedDetail>).detail;
      const { themeId, parentId, themeRepliesCount, parentRepliesCount, reply } = detail;
      setSlices((prev) => {
        let next = patchReplyCountsInSlices(
          prev,
          themeId,
          parentId,
          themeRepliesCount,
          parentRepliesCount,
        );
        if (username !== getStoredUsername() || reply.author.username !== username) {
          return next;
        }
        const profileReply = buildProfileReplyFromCreated(detail);
        if (!profileReply) {
          // Не собрали корректный элемент (нет темы/родителя в кэше) —
          // помечаем срез на дозагрузку, чтобы открытие вкладки показало свежее.
          return next.replies.loaded
            ? { ...next, replies: { ...next.replies, loaded: false } }
            : next;
        }
        return prependReplyToSlice(next, profileReply);
      });
      if (username === getStoredUsername() && reply.author.username === username) {
        setTabCounts((c) => ({ ...c, replies: c.replies + 1 }));
      }
    };
    const onReplyLike = (e: Event) => {
      const { replyId, liked, likes_count } = (e as CustomEvent<ReplyLikeDetail>).detail;
      setSlices((prev) =>
        mapSlices(prev, (slice) => ({
          ...slice,
          replies: slice.replies.map((r) =>
            r.id === replyId ? { ...r, is_liked: liked, likes_count } : r,
          ),
          // Аналогично темам: держим reposts-срез синхронным по лайку ответа.
          reposts: slice.reposts.map((item) =>
            item.kind === "reply" && item.reply?.id === replyId
              ? { ...item, reply: { ...item.reply, is_liked: liked, likes_count } }
              : item,
          ),
        })),
      );
    };
    const onReplyRepost = (e: Event) => {
      const { replyId, reposted, reposts_count } = (e as CustomEvent<ReplyRepostDetail>).detail;
      const isOwnProfile = username === getStoredUsername();
      const key = `reply:${replyId}`;
      if (!reposted && isOwnProfile) {
        scheduleRepostRemove(key);
      }
      const hadRepost =
        reposted &&
        isOwnProfile &&
        slicesRef.current.reposts.reposts.some(
          (r) => r.kind === "reply" && r.reply?.id === replyId,
        );
      setSlices((prev) => {
        let next = mapSlices(prev, (slice) => ({
          ...slice,
          replies: slice.replies.map((r) =>
            r.id === replyId ? { ...r, is_reposted: reposted, reposts_count } : r,
          ),
          reposts: slice.reposts.map((item) => {
            if (item.kind !== "reply" || item.reply?.id !== replyId) return item;
            return {
              ...item,
              reply: { ...item.reply, is_reposted: reposted, reposts_count },
            };
          }),
        }));
        if (reposted && isOwnProfile) {
          const source =
            findReplyInSlices(next, replyId) ?? findReplyInAllCaches(replyId);
          if (source) {
            next = prependToRepostsSlice(next, {
              kind: "reply",
              reposted_at: new Date().toISOString(),
              theme: null,
              reply: { ...source, is_reposted: true, reposts_count },
            });
          } else if (next.reposts.loaded) {
            next = { ...next, reposts: { ...next.reposts, loaded: false } };
          }
        }
        return next;
      });
      if (reposted && isOwnProfile && !hadRepost) {
        setTabCounts((c) => ({ ...c, reposts: c.reposts + 1 }));
      }
    };
    const onThemeDeleted = (e: Event) => {
      const { themeId } = (e as CustomEvent<ThemeDeletedDetail>).detail;
      const inThemes = slicesRef.current.themes.themes.some((t) => t.id === themeId);
      if (inThemes) {
        if (!exitingThemeIdsRef.current.has(themeId)) {
          scheduleThemeRemove(themeId);
        }
        return;
      }
      removeThemeFromSlice(themeId);
      setTabCounts((c) => ({ ...c, themes: Math.max(0, c.themes - 1) }));
    };
    const onReplyDeleted = (e: Event) => {
      const { replyId, themeId, themeRepliesCount, parentRepliesCount } = (
        e as CustomEvent<ReplyDeletedDetail>
      ).detail;
      const inReplies = slicesRef.current.replies.replies.some((r) => r.id === replyId);
      setSlices((prev) =>
        mapSlices(prev, (slice) => ({
          ...slice,
          themes: slice.themes.map((t) =>
            t.id === themeId ? { ...t, replies_count: themeRepliesCount } : t,
          ),
          replies: inReplies
            ? slice.replies.map((r) => {
                if (r.theme.id === themeId) {
                  return { ...r, theme: { ...r.theme, replies_count: themeRepliesCount } };
                }
                return r;
              })
            : slice.replies
                .filter((r) => r.id !== replyId)
                .map((r) => {
                  if (r.theme.id === themeId) {
                    return { ...r, theme: { ...r.theme, replies_count: themeRepliesCount } };
                  }
                  return r;
                }),
        })),
      );
      if (inReplies) {
        if (!exitingReplyIdsRef.current.has(replyId)) {
          scheduleReplyRemove(replyId);
        }
        return;
      }
      setTabCounts((c) => ({ ...c, replies: Math.max(0, c.replies - 1) }));
    };
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    window.addEventListener(THEME_CREATED_EVENT, onThemeCreated);
    window.addEventListener(THEME_LIKE_EVENT, onThemeLike);
    window.addEventListener(THEME_REPOST_EVENT, onThemeRepost);
    window.addEventListener(REPLY_CREATED_EVENT, onReplyCreated);
    window.addEventListener(REPLY_LIKE_EVENT, onReplyLike);
    window.addEventListener(REPLY_REPOST_EVENT, onReplyRepost);
    window.addEventListener(THEME_DELETED_EVENT, onThemeDeleted);
    window.addEventListener(REPLY_DELETED_EVENT, onReplyDeleted);
    return () => {
      window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
      window.removeEventListener(THEME_CREATED_EVENT, onThemeCreated);
      window.removeEventListener(THEME_LIKE_EVENT, onThemeLike);
      window.removeEventListener(THEME_REPOST_EVENT, onThemeRepost);
      window.removeEventListener(REPLY_CREATED_EVENT, onReplyCreated);
      window.removeEventListener(REPLY_LIKE_EVENT, onReplyLike);
      window.removeEventListener(REPLY_REPOST_EVENT, onReplyRepost);
      window.removeEventListener(THEME_DELETED_EVENT, onThemeDeleted);
      window.removeEventListener(REPLY_DELETED_EVENT, onReplyDeleted);
    };
  }, [
    removeThemeFromSlice,
    scheduleReplyRemove,
    scheduleRepostRemove,
    scheduleThemeRemove,
    username,
  ]);

  const activeSlice = slices[tab];
  const activeLoading = loadingTab === tab;
  const listKey = `/u/${username}?tab=${tab}`;
  const { panelEnterClass, itemEnter } = useTabSwitchAnimation(
    tab,
    activeSlice.loaded && !activeLoading,
  );

  useEffect(() => {
    setListKey(listKey);
  }, [listKey]);

  useRestoreAnchor(
    listKey,
    activeSlice.loaded &&
      !activeLoading &&
      (activeSlice.themes.length > 0 ||
        activeSlice.replies.length > 0 ||
        activeSlice.media.length > 0 ||
        activeSlice.reposts.length > 0),
  );

  const sentinelRef = useInfiniteScroll({
    hasMore: !!activeSlice.nextCursor,
    loading: activeLoading,
    onLoadMore: () => {
      if (activeSlice.nextCursor) load(tab, activeSlice.nextCursor);
    },
  });

  const TAB_DEFS: { id: ProfileTab; label: string; count: number }[] = [
    { id: "themes", label: t("themes"), count: tabCounts.themes },
    { id: "replies", label: t("replies"), count: tabCounts.replies },
    { id: "media", label: t("media"), count: tabCounts.media },
    { id: "reposts", label: t("reposts"), count: tabCounts.reposts },
  ];

  const isOwnProfile = getStoredUsername() === username;
  const themeRepostProps = isOwnProfile
    ? { onRepostChange: handleRepostChange }
    : {};
  const replyRepostProps = isOwnProfile
    ? { onRepostChange: handleReplyRepostChange }
    : {};

  return (
    <>
      <AnimatedTabBar
        className="profile-tabs"
        ariaLabel={t("postsAria")}
        activeId={tab}
        onSelect={switchTab}
        tabs={TAB_DEFS.map((t) => ({ id: t.id, label: t.label }))}
      />

      <div className="profile-tab-panels" ref={panelsRef}>
        {ALL_TABS.map((tabId) => {
          const slice = slices[tabId];
          const isActive = tab === tabId;
          const isLoading = loadingTab === tabId;
          const items =
            tabId === "replies"
              ? slice.replies
              : tabId === "media"
                ? slice.media
                : tabId === "reposts"
                  ? slice.reposts
                  : slice.themes;
          const showPanel = isActive || slice.loaded;

          if (!showPanel) return null;

          return (
            <div
              key={tabId}
              role="tabpanel"
              hidden={!isActive}
              className={`profile-tab-panel${isActive ? ` ${panelEnterClass}` : ""}`}
            >
              {isActive && error && <p className="muted">{error}</p>}
              {isActive && !isLoading && !error && items.length === 0 && (
                <p className="muted">{t(EMPTY_TEXT_KEYS[tabId])}</p>
              )}

              <div className="feed-list">
                {tabId === "replies"
                  ? slice.replies.map((r, index) => (
                      <ListEnterItem
                        key={`r-${r.id}`}
                        index={index}
                        animate={isActive && itemEnter}
                      >
                        <ListExitWrap
                          exiting={exitingReplyIds.has(r.id)}
                          onExitComplete={() => finishReplyRemove(r.id)}
                        >
                          <div className="profile-reply-thread">
                            <div className="thread-chain">
                              {r.parent ? (
                                <ReplyCard
                                  reply={r.parent}
                                  threadLineBelow
                                  clickable
                                />
                              ) : (
                                <ThemeCard
                                  theme={r.theme}
                                  threadLineBelow
                                  {...themeRepostProps}
                                  onDeleted={() => removeThemeFromSlices(r.theme.id)}
                                />
                              )}
                              <ReplyCard
                                reply={r}
                                indented
                                clickable
                                listExitViaParent={isOwnProfile}
                                onDeleteExitStart={(detail) => {
                                  pendingReplyDeletes.current.set(r.id, detail);
                                  scheduleReplyRemove(r.id);
                                }}
                                onDeleteExitFailed={() => cancelReplyRemove(r.id)}
                              />
                            </div>
                          </div>
                        </ListExitWrap>
                      </ListEnterItem>
                    ))
                  : tabId === "reposts"
                    ? slice.reposts.map((item, index) => {
                        const key = profileRepostKey(item);
                        if (item.kind === "reply" && item.reply) {
                          const reply = item.reply;
                          return (
                            <ListEnterItem
                              key={key}
                              index={index}
                              animate={isActive && itemEnter}
                            >
                              <ListExitWrap
                                exiting={exitingRepostIds.has(key)}
                                onExitComplete={() => removeRepostFromSlice(key)}
                              >
                                <ReplyCard
                                  reply={reply}
                                  clickable
                                  showReplyBadge
                                  {...replyRepostProps}
                                />
                              </ListExitWrap>
                            </ListEnterItem>
                          );
                        }
                        if (item.kind === "theme" && item.theme) {
                          const theme = item.theme;
                          return (
                            <ListEnterItem
                              key={key}
                              index={index}
                              animate={isActive && itemEnter}
                            >
                              <ListExitWrap
                                exiting={exitingRepostIds.has(key)}
                                onExitComplete={() => removeRepostFromSlice(key)}
                              >
                                <ThemeCard
                                  theme={theme}
                                  {...themeRepostProps}
                                  onDeleted={() => removeThemeFromSlices(theme.id)}
                                />
                              </ListExitWrap>
                            </ListEnterItem>
                          );
                        }
                        return null;
                      })
                    : tabId === "themes"
                      ? slice.themes.map((t, index) => (
                          <ListEnterItem
                            key={`${tabId}-${t.id}`}
                            index={index}
                            animate={isActive && itemEnter}
                          >
                            <ListExitWrap
                              exiting={exitingThemeIds.has(t.id)}
                              onExitComplete={() => finishThemeRemove(t.id)}
                            >
                              <ThemeCard
                                theme={t}
                                listExitViaParent={isOwnProfile}
                                onDeleteExitStart={() => {
                                  pendingThemeDeletes.current.add(t.id);
                                  scheduleThemeRemove(t.id);
                                }}
                                onDeleteExitFailed={() => cancelThemeRemove(t.id)}
                                {...themeRepostProps}
                              />
                            </ListExitWrap>
                          </ListEnterItem>
                        ))
                      : (
                        <ProfileMediaGrid
                          username={username}
                          items={slice.media}
                          enter={isActive && itemEnter}
                        />
                      )}
              </div>

              {isActive && isLoading && items.length === 0 && (
                <p className="muted">{t("common:loading")}</p>
              )}

              {isActive && slice.nextCursor && (
                <>
                  <div ref={sentinelRef} className="feed-sentinel" aria-hidden="true" />
                  {!isLoading && (
                    <p className="muted">
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => load(tabId, slice.nextCursor!)}
                      >
                        {t("common:showMore")}
                      </button>
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
