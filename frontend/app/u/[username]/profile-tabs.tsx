"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReplyCard from "@/components/ReplyCard";
import ThemeCard from "@/components/ThemeCard";
import {
  AUTH_EVENT,
  THEME_LIKE_EVENT,
  THEME_REPOST_EVENT,
  ThemeLikeDetail,
  ThemeRepostDetail,
  USER_PROFILE_EVENT,
  UserProfileUpdatedDetail,
  getUserMedia,
  getUserReplies,
  getUserReposts,
  getUserThemes,
} from "@/lib/api";
import {
  ProfileTab,
  ProfileSlice,
  PROFILE_TABS,
  getProfileTabsCache,
  setProfileTabsCache,
} from "@/lib/profile-tabs-cache";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
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
  return { themes: [], replies: [], nextCursor: null, loaded: false };
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

export interface ProfileCounts {
  themes: number;
  replies: number;
  media: number;
  reposts: number;
}

const EMPTY_TEXT: Record<ProfileTab, string> = {
  themes: "No themes yet.",
  replies: "No replies yet.",
  media: "No media yet.",
  reposts: "No reposts yet.",
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

function resolveInitialState(username: string): InitialState {
  const cached = getProfileTabsCache(username);
  if (cached) {
    const tab = cached.tab;
    return {
      tab,
      slices: cached.slices,
      loadingTab: cached.slices[tab].loaded ? null : tab,
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
  const initial = resolveInitialState(username);
  const [tab, setTab] = useState<ProfileTab>(initial.tab);
  const [slices, setSlices] = useState<Record<ProfileTab, TabSlice>>(initial.slices);
  const [loadingTab, setLoadingTab] = useState<ProfileTab | null>(initial.loadingTab);
  const [error, setError] = useState("");
  const slicesRef = useRef(slices);
  const syncedUsername = useRef(username);
  const panelsRef = useRef<HTMLDivElement>(null);
  const lockedScrollY = useRef<number | null>(null);
  const scrollLocked = useRef(false);
  const programmaticScroll = useRef(false);

  slicesRef.current = slices;

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
                nextCursor,
                loaded: true,
              },
            };
          });
          return;
        }

        const fetcher =
          activeTab === "reposts"
            ? getUserReposts
            : activeTab === "media"
              ? getUserMedia
              : getUserThemes;
        const page = await fetcher(username, cursor);
        const nextCursor = page.next
          ? new URL(page.next, "http://x").searchParams.get("cursor")
          : null;
        setSlices((prev) => {
          const slice = prev[activeTab];
          return {
            ...prev,
            [activeTab]: {
              themes: cursor ? [...slice.themes, ...page.results] : page.results,
              replies: [],
              nextCursor,
              loaded: true,
            },
          };
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load posts");
      } finally {
        setLoadingTab((currentTab) => (currentTab === activeTab ? null : currentTab));
      }
    },
    [username],
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
      setTab(cached.tab);
      setSlices(cached.slices);
      setLoadingTab(cached.slices[cached.tab].loaded ? null : cached.tab);
      setError("");
      return;
    }
    setTab("themes");
    setSlices(emptySlices());
    setLoadingTab("themes");
    setError("");
    window.scrollTo(0, 0);
  }, [username, unlockScroll]);

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
        })),
      );
    };
    const onThemeRepost = (e: Event) => {
      const { themeId, reposted, reposts_count } = (e as CustomEvent<ThemeRepostDetail>).detail;
      setSlices((prev) =>
        mapSlices(prev, (slice, tabId) => {
          if (tabId === "reposts" && !reposted) {
            return {
              ...slice,
              themes: slice.themes.filter((t) => t.id !== themeId),
            };
          }
          return {
            ...slice,
            themes: slice.themes.map((t) =>
              t.id === themeId ? { ...t, is_reposted: reposted, reposts_count } : t,
            ),
            replies: slice.replies.map((r) =>
              r.theme.id === themeId
                ? { ...r, theme: { ...r.theme, is_reposted: reposted, reposts_count } }
                : r,
            ),
          };
        }),
      );
    };
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    window.addEventListener(THEME_LIKE_EVENT, onThemeLike);
    window.addEventListener(THEME_REPOST_EVENT, onThemeRepost);
    return () => {
      window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
      window.removeEventListener(THEME_LIKE_EVENT, onThemeLike);
      window.removeEventListener(THEME_REPOST_EVENT, onThemeRepost);
    };
  }, []);

  const activeSlice = slices[tab];
  const activeLoading = loadingTab === tab;
  const listKey = `/u/${username}?tab=${tab}`;

  useEffect(() => {
    setListKey(listKey);
  }, [listKey]);

  useRestoreAnchor(
    listKey,
    activeSlice.loaded && !activeLoading && (activeSlice.themes.length > 0 || activeSlice.replies.length > 0),
  );

  const sentinelRef = useInfiniteScroll({
    hasMore: !!activeSlice.nextCursor,
    loading: activeLoading,
    onLoadMore: () => {
      if (activeSlice.nextCursor) load(tab, activeSlice.nextCursor);
    },
  });

  const TAB_DEFS: { id: ProfileTab; label: string; count: number }[] = [
    { id: "themes", label: "Themes", count: counts.themes },
    { id: "replies", label: "Replies", count: counts.replies },
    { id: "media", label: "Media", count: counts.media },
    { id: "reposts", label: "Reposts", count: counts.reposts },
  ];

  return (
    <>
      <div className="tabs profile-tabs" role="tablist" aria-label="Profile posts">
        {TAB_DEFS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "active" : ""}
            onClick={(e) => {
              switchTab(t.id);
              e.currentTarget.blur();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="profile-tab-panels" ref={panelsRef}>
        {ALL_TABS.map((tabId) => {
          const slice = slices[tabId];
          const isActive = tab === tabId;
          const isLoading = loadingTab === tabId;
          const items = tabId === "replies" ? slice.replies : slice.themes;
          const showPanel = isActive || slice.loaded;

          if (!showPanel) return null;

          return (
            <div
              key={tabId}
              role="tabpanel"
              hidden={!isActive}
              className="profile-tab-panel"
            >
              {isActive && error && <p className="muted">{error}</p>}
              {isActive && !isLoading && !error && items.length === 0 && (
                <p className="muted">{EMPTY_TEXT[tabId]}</p>
              )}

              <div className="feed-list">
                {tabId === "replies"
                  ? slice.replies.map((r) => (
                      <div key={`r-${r.id}`} className="profile-reply-thread">
                        <div className="thread-chain">
                          <ThemeCard theme={r.theme} threadLineBelow />
                          <ReplyCard reply={r} indented clickable />
                        </div>
                      </div>
                    ))
                  : slice.themes.map((t) => (
                      <ThemeCard key={`${tabId}-${t.id}`} theme={t} />
                    ))}
              </div>

              {isActive && isLoading && items.length === 0 && (
                <p className="muted">Loading…</p>
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
                        Show more
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
