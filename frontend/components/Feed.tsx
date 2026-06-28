"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ThemeCard from "@/components/ThemeCard";
import LoginCta from "@/components/LoginCta";
import VirtualizedFeedList from "@/components/VirtualizedFeedList";
import {
  AUTH_EVENT,
  FOLLOW_EVENT,
  FollowChangedDetail,
  REPLY_CREATED_EVENT,
  ReplyCreatedDetail,
  THEME_CREATED_EVENT,
  THEME_LIKE_EVENT,
  THEME_REPOST_EVENT,
  THEME_DELETED_EVENT,
  ThemeDeletedDetail,
  ThemeLikeDetail,
  ThemeRepostDetail,
  USER_PROFILE_EVENT,
  UserProfileUpdatedDetail,
  CursorPage,
  FeedTab,
  Theme,
  getFeed,
  getStoredUsername,
  isLoggedIn,
} from "@/lib/api";
import {
  getFeedCache,
  setFeedCache,
  getLastFeedTab,
  setLastFeedTab,
  removeAuthorFromFollowingFeedCache,
  hydrateFeedCacheFromDisk,
  wasHydratedFromDisk,
  markFeedRevalidated,
} from "@/lib/feed-cache";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import {
  findReturnAnchorByPrefix,
  parseListKeySearchParams,
  peekReturnAnchorForList,
  setListKey,
} from "@/lib/return-anchor";
import { useRestoreAnchor } from "@/lib/use-restore-anchor";
import { patchThemeAuthors } from "@/lib/user-avatar-store";

type WallTab = "for-you" | "following";

const ALL_TABS: WallTab[] = ["for-you", "following"];

type TabSlice = {
  themes: Theme[];
  nextCursor: string | null;
  loaded: boolean;
};

const EMPTY_TEXT: Record<WallTab, string> = {
  "for-you": "Nothing here yet. Be the first!",
  following: "Follow people to see their themes here.",
};

function emptySlice(): TabSlice {
  return { themes: [], nextCursor: null, loaded: false };
}

function emptySlices(): Record<WallTab, TabSlice> {
  return { "for-you": emptySlice(), following: emptySlice() };
}

function normalizeTab(tab: string): WallTab {
  return tab === "following" ? "following" : "for-you";
}

function cursorFromNext(next: string | null): string | null {
  return next ? new URL(next, "http://x").searchParams.get("cursor") : null;
}

function initSlicesFromCache(): Record<WallTab, TabSlice> {
  const slices = emptySlices();
  for (const tabId of ALL_TABS) {
    const cache = getFeedCache(tabId);
    if (cache && cache.themes.length) {
      slices[tabId] = {
        themes: cache.themes,
        nextCursor: cache.nextCursor,
        loaded: true,
      };
    }
  }
  return slices;
}

function mapSlices(
  slices: Record<WallTab, TabSlice>,
  fn: (slice: TabSlice, tabId: WallTab) => TabSlice,
): Record<WallTab, TabSlice> {
  const next = { ...slices };
  for (const tabId of ALL_TABS) {
    next[tabId] = fn(slices[tabId], tabId);
  }
  return next;
}

function initialWallTab(): WallTab {
  const anchor = findReturnAnchorByPrefix("/?tab=");
  if (anchor) {
    const tab = parseListKeySearchParams(anchor.listKey).get("tab");
    if (tab) return normalizeTab(tab);
  }
  return normalizeTab(getLastFeedTab());
}

export default function Feed() {
  const router = useRouter();
  const pathname = usePathname();
  const initialTab = initialWallTab();

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<WallTab>(initialTab);
  const [slices, setSlices] = useState<Record<WallTab, TabSlice>>(initSlicesFromCache);
  const [loadingTab, setLoadingTab] = useState<WallTab | null>(() => {
    const cached = getFeedCache(initialTab);
    return cached && cached.themes.length ? null : initialTab;
  });
  const [error, setError] = useState("");

  const slicesRef = useRef(slices);
  const tabRef = useRef<WallTab>(initialTab);
  const panelsRef = useRef<HTMLDivElement>(null);
  const lockedScrollY = useRef<number | null>(null);
  const scrollLocked = useRef(false);
  const programmaticScroll = useRef(false);

  // Предзагруженная вперёд страница на вкладку: ключуем по курсору, чтобы при
  // достижении конца ленты добавить её мгновенно, без ожидания сети.
  type Prefetch = { cursor: string; promise: Promise<CursorPage<Theme>> };
  const prefetchRef = useRef<Partial<Record<WallTab, Prefetch | undefined>>>({});
  // Последняя упавшая загрузка — чтобы повторить вручную (кнопка) или авто при
  // восстановлении соединения.
  const failedRef = useRef<{ tab: WallTab; cursor?: string } | null>(null);
  // Вкладки, которые уже ревалидировали после показа из дискового кэша.
  const revalidatedRef = useRef<Set<WallTab>>(new Set());
  // Защита от повторной догрузки той же порции (мгновенный путь не поднимает
  // loadingTab, поэтому observer не отключается — нужен отдельный флаг).
  const loadMoreInFlight = useRef<Partial<Record<WallTab, boolean>>>({});

  slicesRef.current = slices;
  tabRef.current = tab;

  const applyScrollFloor = useCallback(() => {
    const el = panelsRef.current;
    const y = lockedScrollY.current;
    if (!el || y === null) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const minHeight = y + window.innerHeight - top;
    el.style.minHeight = `${Math.max(el.offsetHeight, minHeight)}px`;
  }, []);

  const restoreLockedScroll = useCallback(() => {
    if (findReturnAnchorByPrefix("/?tab=")) return;
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

  // Тихо запрашиваем следующую страницу заранее (за 2-3 экрана до конца) и
  // держим её в памяти. Не дублируем уже идущий префетч того же курсора.
  const prefetchNext = useCallback((activeTab: WallTab, cursor: string | null) => {
    if (!cursor) return;
    const existing = prefetchRef.current[activeTab];
    if (existing && existing.cursor === cursor) return;
    const entry: Prefetch = { cursor, promise: getFeed(activeTab as FeedTab, cursor) };
    prefetchRef.current[activeTab] = entry;
    entry.promise.catch(() => {
      // Ошибку префетча проглатываем: обычная загрузка повторит запрос и покажет
      // пользователю состояние ошибки. Сбрасываем слот, чтобы можно было повторить.
      if (prefetchRef.current[activeTab] === entry) {
        prefetchRef.current[activeTab] = undefined;
      }
    });
  }, []);

  const applyPage = useCallback(
    (activeTab: WallTab, cursor: string | undefined, page: CursorPage<Theme>) => {
      const next = cursorFromNext(page.next);
      setSlices((prev) => {
        const slice = prev[activeTab];
        return {
          ...prev,
          [activeTab]: {
            themes: cursor ? [...slice.themes, ...page.results] : page.results,
            nextCursor: next,
            loaded: true,
          },
        };
      });
      // Сразу готовим следующую порцию, чтобы дойдя до конца, добавить мгновенно.
      prefetchNext(activeTab, next);
    },
    [prefetchNext],
  );

  const load = useCallback(
    async (activeTab: WallTab, cursor?: string, force = false) => {
      if (!cursor && !force && slicesRef.current[activeTab].loaded) return;

      setLoadingTab(activeTab);
      setError("");
      try {
        const page = await getFeed(activeTab as FeedTab, cursor);
        if (tabRef.current !== activeTab && !cursor) return;
        failedRef.current = null;
        applyPage(activeTab, cursor, page);
      } catch (e) {
        if (tabRef.current === activeTab) {
          failedRef.current = { tab: activeTab, cursor };
          setError(e instanceof Error ? e.message : "Failed to load the feed");
        }
      } finally {
        setLoadingTab((current) => (current === activeTab ? null : current));
      }
    },
    [applyPage],
  );

  // Stale-while-revalidate: показав посты из дискового кэша, в фоне подтягиваем
  // первую страницу и доклеиваем сверху только новые посты (курсор не трогаем).
  // Если свежая страница совсем не пересекается с кэшем (кэш сильно устарел) —
  // заменяем целиком, чтобы не было разрыва в хронологии.
  const revalidate = useCallback(async (activeTab: WallTab) => {
    try {
      const page = await getFeed(activeTab as FeedTab);
      markFeedRevalidated(activeTab);
      const freshNext = cursorFromNext(page.next);
      setSlices((prev) => {
        const slice = prev[activeTab];
        const existingIds = new Set(slice.themes.map((t) => t.id));
        const overlap = page.results.some((t) => existingIds.has(t.id));
        if (overlap) {
          const newOnes = page.results.filter((t) => !existingIds.has(t.id));
          if (newOnes.length === 0) return prev;
          return {
            ...prev,
            [activeTab]: { ...slice, themes: [...newOnes, ...slice.themes] },
          };
        }
        return {
          ...prev,
          [activeTab]: {
            themes: page.results,
            nextCursor: freshNext,
            loaded: true,
          },
        };
      });
      prefetchNext(activeTab, freshNext);
    } catch {
      // Сеть недоступна — оставляем кэшированные посты как есть.
    }
  }, [prefetchNext]);

  // Догрузка следующей порции при достижении конца ленты. Если страница уже
  // предзагружена (prefetch) — добавляем её мгновенно, без спиннера и без сети.
  const loadMore = useCallback(
    async (activeTab: WallTab, cursor: string) => {
      if (loadMoreInFlight.current[activeTab]) return;
      const entry = prefetchRef.current[activeTab];
      if (entry && entry.cursor === cursor) {
        prefetchRef.current[activeTab] = undefined;
        loadMoreInFlight.current[activeTab] = true;
        try {
          const page = await entry.promise;
          failedRef.current = null;
          applyPage(activeTab, cursor, page);
        } catch {
          // Префетч не удался — повторяем как обычную загрузку с индикатором.
          load(activeTab, cursor);
        } finally {
          loadMoreInFlight.current[activeTab] = false;
        }
        return;
      }
      load(activeTab, cursor);
    },
    [applyPage, load],
  );

  const switchTab = useCallback(
    (nextTab: WallTab) => {
      if (nextTab === tab) return;
      if (nextTab === "following" && !isLoggedIn()) {
        router.push("/login");
        return;
      }
      setLastFeedTab(nextTab);
      lockScrollPosition();
      setTab(nextTab);
      setError("");
    },
    [tab, lockScrollPosition, router],
  );

  useEffect(() => {
    setAuthed(isLoggedIn());
  }, []);

  // После back-btn React может восстановить старое состояние — подтягиваем из кэша.
  useEffect(() => {
    if (pathname !== "/") return;
    setSlices((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const tabId of ALL_TABS) {
        const cache = getFeedCache(tabId);
        if (!cache?.themes.length) continue;
        next[tabId] = {
          themes: cache.themes,
          nextCursor: cache.nextCursor,
          loaded: true,
        };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [pathname]);

  // Дисковый кэш поднимаем только ПОСЛЕ монтирования (не во время рендера),
  // иначе серверный HTML без localStorage не совпадёт с клиентским (гидрация).
  // Должен идти ДО эффекта load(), чтобы тот не слал лишний запрос по вкладке,
  // которую мы только что показали из кэша.
  useEffect(() => {
    hydrateFeedCacheFromDisk();
    let hydrated = false;
    const next = { ...slicesRef.current };
    for (const tabId of ALL_TABS) {
      if (next[tabId].loaded) continue;
      const cache = getFeedCache(tabId);
      if (cache && cache.themes.length) {
        next[tabId] = {
          themes: cache.themes,
          nextCursor: cache.nextCursor,
          loaded: true,
        };
        hydrated = true;
      }
    }
    if (hydrated) {
      // Обновляем ref синхронно, чтобы эффект load() ниже увидел loaded=true.
      slicesRef.current = next;
      setSlices(next);
      setLoadingTab((cur) => (cur && next[cur].loaded ? null : cur));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  // Если активная вкладка показана из дискового кэша — один раз ревалидируем её
  // в фоне (свежие посты сверху), не трогая мгновенно показанный кэш.
  useEffect(() => {
    if (revalidatedRef.current.has(tab)) return;
    if (!wasHydratedFromDisk(tab)) return;
    revalidatedRef.current.add(tab);
    revalidate(tab);
  }, [tab, revalidate]);

  // При восстановлении соединения автоматически повторяем упавшую загрузку.
  useEffect(() => {
    const onOnline = () => {
      const failed = failedRef.current;
      if (!failed) return;
      load(failed.tab, failed.cursor, !failed.cursor);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [load]);

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
      const nowAuthed = isLoggedIn();
      setAuthed(nowAuthed);
      unlockScroll();
      let next: WallTab = tabRef.current;
      if (next === "following" && !nowAuthed) next = "for-you";
      setLastFeedTab(next);
      setTab(next);
      setSlices(emptySlices());
      setLoadingTab(next);
      setError("");
      load(next, undefined, true);
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [load, unlockScroll]);

  useEffect(() => {
    for (const tabId of ALL_TABS) {
      const slice = slices[tabId];
      if (!slice.loaded) continue;
      setFeedCache(tabId, {
        themes: slice.themes,
        nextCursor: slice.nextCursor,
        scrollY: 0,
      });
    }
  }, [slices]);

  useEffect(() => {
    const onFollow = (e: Event) => {
      const { profileUsername, following } = (e as CustomEvent<FollowChangedDetail>).detail;
      if (following === true) {
        // Кэш Following уже сброшен в emitFollowChanged. Помечаем срез на
        // перезагрузку (старые темы остаются на экране, без мигания), а если
        // вкладка сейчас активна — сразу подтягиваем свежий список с сервера.
        setSlices((prev) => ({
          ...prev,
          following: { ...prev.following, loaded: false },
        }));
        if (tabRef.current === "following") {
          load("following", undefined, true);
        }
        return;
      }
      if (following !== false) return;
      removeAuthorFromFollowingFeedCache(profileUsername);
      setSlices((prev) => ({
        ...prev,
        following: {
          ...prev.following,
          themes: prev.following.themes.filter(
            (t) => t.author.username !== profileUsername,
          ),
        },
      }));
    };
    window.addEventListener(FOLLOW_EVENT, onFollow);
    return () => window.removeEventListener(FOLLOW_EVENT, onFollow);
  }, [load]);

  useEffect(() => {
    const onThemeLike = (e: Event) => {
      const { themeId, liked, likes_count } = (e as CustomEvent<ThemeLikeDetail>).detail;
      setSlices((prev) =>
        mapSlices(prev, (slice) => ({
          ...slice,
          themes: slice.themes.map((t) =>
            t.id === themeId ? { ...t, is_liked: liked, likes_count } : t,
          ),
        })),
      );
    };
    const onThemeRepost = (e: Event) => {
      const { themeId, reposted, reposts_count } = (e as CustomEvent<ThemeRepostDetail>).detail;
      setSlices((prev) =>
        mapSlices(prev, (slice) => ({
          ...slice,
          themes: slice.themes.map((t) =>
            t.id === themeId ? { ...t, is_reposted: reposted, reposts_count } : t,
          ),
        })),
      );
    };
    window.addEventListener(THEME_LIKE_EVENT, onThemeLike);
    window.addEventListener(THEME_REPOST_EVENT, onThemeRepost);
    const onThemeDeleted = (e: Event) => {
      const { themeId } = (e as CustomEvent<ThemeDeletedDetail>).detail;
      setSlices((prev) =>
        mapSlices(prev, (slice) => ({
          ...slice,
          themes: slice.themes.filter((t) => t.id !== themeId),
        })),
      );
    };
    window.addEventListener(THEME_DELETED_EVENT, onThemeDeleted);
    return () => {
      window.removeEventListener(THEME_LIKE_EVENT, onThemeLike);
      window.removeEventListener(THEME_REPOST_EVENT, onThemeRepost);
      window.removeEventListener(THEME_DELETED_EVENT, onThemeDeleted);
    };
  }, []);

  useEffect(() => {
    const onThemeCreated = (e: Event) => {
      const theme = (e as CustomEvent<Theme>).detail;
      const myUsername = getStoredUsername();
      setSlices((prev) => {
        const next = { ...prev };
        const forYou = prev["for-you"];
        if (!forYou.themes.some((t) => t.id === theme.id)) {
          next["for-you"] = { ...forYou, themes: [theme, ...forYou.themes] };
        }
        if (myUsername && theme.author.username === myUsername) {
          next.following = {
            ...prev.following,
            themes: prev.following.themes.filter((t) => t.id !== theme.id),
          };
        }
        return next;
      });
    };
    const onReplyCreated = (e: Event) => {
      const { themeId, themeRepliesCount } = (e as CustomEvent<ReplyCreatedDetail>).detail;
      setSlices((prev) =>
        mapSlices(prev, (slice) => ({
          ...slice,
          themes: slice.themes.map((t) =>
            t.id === themeId ? { ...t, replies_count: themeRepliesCount } : t,
          ),
        })),
      );
    };
    const onProfileUpdated = (e: Event) => {
      const { username, avatar } = (e as CustomEvent<UserProfileUpdatedDetail>).detail;
      if (avatar === undefined) return;
      setSlices((prev) =>
        mapSlices(prev, (slice) => ({
          ...slice,
          themes: patchThemeAuthors(slice.themes, username, avatar),
        })),
      );
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

  const activeSlice = slices[tab];
  const activeLoading = loadingTab === tab;
  const listKey = `/?tab=${tab}`;

  // Если ждём возврат к карточке (после back), держим её в DOM даже вне окна
  // виртуализации, чтобы useRestoreAnchor нашёл элемент и спозиционировался.
  const pendingAnchor = peekReturnAnchorForList(listKey);
  const anchorThemeId =
    pendingAnchor && pendingAnchor.kind === "theme" ? pendingAnchor.id : null;

  useEffect(() => {
    setListKey(listKey);
  }, [listKey]);

  useRestoreAnchor(listKey, activeSlice.loaded && !activeLoading);

  const sentinelRef = useInfiniteScroll({
    hasMore: !!activeSlice.nextCursor,
    loading: activeLoading,
    onLoadMore: () => {
      const cursor = slicesRef.current[tab].nextCursor;
      if (cursor) loadMore(tab, cursor);
    },
  });

  return (
    <main>
      <PageHeader title="Main wall" showBack={false} />

      {authed === true && (
        <div className="tabs feed-tabs" role="tablist" aria-label="Feed">
          {ALL_TABS.map((tabId) => (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={tab === tabId}
              className={tab === tabId ? "active" : ""}
              onClick={(e) => {
                switchTab(tabId);
                e.currentTarget.blur();
              }}
            >
              {tabId === "for-you" ? "For you" : "Following"}
            </button>
          ))}
        </div>
      )}

      <div className="profile-tab-panels feed-tab-panels" ref={panelsRef}>
        {ALL_TABS.map((tabId) => {
          const slice = slices[tabId];
          const isActive = tab === tabId;
          const isLoading = loadingTab === tabId;
          const showPanel = isActive || slice.loaded;

          if (!showPanel) return null;

          return (
            <div
              key={tabId}
              role="tabpanel"
              hidden={!isActive}
              className="profile-tab-panel"
            >
              {isActive && error && (
                <p className="muted feed-error">
                  <span>{error}</span>{" "}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      const failed = failedRef.current;
                      if (failed && failed.tab === tabId) {
                        load(tabId, failed.cursor, !failed.cursor);
                      } else {
                        load(tabId, slice.nextCursor ?? undefined, !slice.nextCursor);
                      }
                    }}
                  >
                    Retry
                  </button>
                </p>
              )}
              {isActive && !isLoading && !error && slice.themes.length === 0 && (
                <p className="muted">{EMPTY_TEXT[tabId]}</p>
              )}

              <VirtualizedFeedList
                items={slice.themes}
                className="feed-list"
                getKey={(t) => t.id}
                forceKey={isActive ? anchorThemeId : null}
                renderItem={(t) => (
                  <ThemeCard
                    theme={t}
                    onDeleted={() =>
                      setSlices((prev) => ({
                        ...prev,
                        [tabId]: {
                          ...prev[tabId],
                          themes: prev[tabId].themes.filter((x) => x.id !== t.id),
                        },
                      }))
                    }
                  />
                )}
              />

              {isActive && isLoading && slice.themes.length === 0 && (
                <p className="muted">Loading…</p>
              )}

              {isActive && slice.nextCursor && (
                <>
                  <div ref={sentinelRef} className="feed-sentinel" aria-hidden="true" />
                  {isLoading && slice.themes.length > 0 && (
                    <p className="muted">Loading…</p>
                  )}
                  {!isLoading && (
                    <p className="muted">
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => loadMore(tabId, slice.nextCursor!)}
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

      {authed === false && <LoginCta />}
    </main>
  );
}
