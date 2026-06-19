"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import ThemeCard from "@/components/ThemeCard";
import Avatar from "@/components/Avatar";
import {
  Theme,
  UserPublic,
  USER_PROFILE_EVENT,
  UserProfileUpdatedDetail,
  DiscoverMode,
  getDiscover,
  getPopularQueries,
  searchThemes,
  searchUsers,
} from "@/lib/api";
import {
  pushRecentSearch,
  readDiscoverCache,
  readPopularQueriesCache,
  readRecentSearches,
  type RecentSearch,
  writeDiscoverCache,
  writePopularQueriesCache,
} from "@/lib/search-discover-cache";
import { patchThemeAuthors, patchUserPublicList } from "@/lib/user-avatar-store";
import { findReturnAnchorByPrefix, parseListKeySearchParams, setListKey } from "@/lib/return-anchor";
import { useRestoreAnchor } from "@/lib/use-restore-anchor";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";

type SearchTab = "themes" | "users";

type CacheEntry =
  | { kind: "themes"; items: Theme[]; nextCursor: string | null }
  | { kind: "users"; items: UserPublic[]; nextCursor: string | null };

const DEBOUNCE_MS = 200;
const MIN_QUERY_LEN = 2;

function cacheKey(tab: SearchTab, q: string) {
  return `${tab}:${q.toLowerCase()}`;
}

function parseTab(value: string | null): SearchTab {
  return value === "users" ? "users" : "themes";
}

function parseDiscoverMode(value: string | null): DiscoverMode {
  return value === "trending" ? "trending" : "popular";
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = parseTab(searchParams.get("tab"));
  const urlQuery = searchParams.get("q") ?? "";
  const urlDiscoverMode = parseDiscoverMode(searchParams.get("discover"));

  const returnAnchor = findReturnAnchorByPrefix("/search?");
  const returnParams = returnAnchor ? parseListKeySearchParams(returnAnchor.listKey) : null;
  const initialTab = returnParams ? parseTab(returnParams.get("tab")) : urlTab;
  const initialQuery = returnParams?.get("q") ?? urlQuery;

  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<SearchTab>(initialTab);
  const [discoverMode, setDiscoverMode] = useState<DiscoverMode>(urlDiscoverMode);
  const [themeResults, setThemeResults] = useState<Theme[]>([]);
  const [userResults, setUserResults] = useState<UserPublic[]>([]);
  const [themeNextCursor, setThemeNextCursor] = useState<string | null>(null);
  const [userNextCursor, setUserNextCursor] = useState<string | null>(null);
  const [discover, setDiscover] = useState<{ themes: string[]; users: string[] }>({
    themes: [],
    users: [],
  });
  const [popularQueries, setPopularQueries] = useState<{ themes: string[]; users: string[] }>({
    themes: [],
    users: [],
  });
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [fetching, setFetching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const searchInputId = useId();
  const themesPanelId = useId();
  const usersPanelId = useId();

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const syncedUrlRef = useRef(false);

  useEffect(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  useEffect(() => {
    const cached = readDiscoverCache(discoverMode);
    if (cached) {
      setDiscover({ themes: cached.themes, users: cached.users });
    }
    getDiscover(discoverMode)
      .then((data) => {
        setDiscover({ themes: data.themes, users: data.users });
        writeDiscoverCache(data);
      })
      .catch(() => {});
  }, [discoverMode]);

  useEffect(() => {
    const cached = readPopularQueriesCache();
    if (cached) {
      setPopularQueries({ themes: cached.themes, users: cached.users });
    }
    getPopularQueries()
      .then((data) => {
        setPopularQueries({ themes: data.themes, users: data.users });
        writePopularQueriesCache(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onProfileUpdated = (e: Event) => {
      const { username, avatar } = (e as CustomEvent<UserProfileUpdatedDetail>).detail;
      if (avatar === undefined) return;
      setThemeResults((prev) => patchThemeAuthors(prev, username, avatar));
      setUserResults((prev) => patchUserPublicList(prev, username, avatar));
      for (const [key, entry] of cacheRef.current.entries()) {
        if (entry.kind === "themes") {
          cacheRef.current.set(key, {
            ...entry,
            items: patchThemeAuthors(entry.items, username, avatar),
          });
        } else {
          cacheRef.current.set(key, {
            ...entry,
            items: patchUserPublicList(entry.items, username, avatar),
          });
        }
      }
    };
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    return () => window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
  }, []);

  const syncUrl = useCallback(
    (nextTab: SearchTab, nextQuery: string, nextDiscover: DiscoverMode) => {
      const params = new URLSearchParams();
      params.set("tab", nextTab);
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      if (!nextQuery.trim()) params.set("discover", nextDiscover);
      const next = `/search?${params.toString()}`;
      router.replace(next, { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    if (!syncedUrlRef.current) {
      syncedUrlRef.current = true;
      return;
    }
    syncUrl(tab, query, discoverMode);
  }, [tab, query, discoverMode, syncUrl]);

  const applyCache = useCallback((key: string) => {
    const hit = cacheRef.current.get(key);
    if (!hit) return false;
    if (hit.kind === "themes") {
      setThemeResults(hit.items);
      setThemeNextCursor(hit.nextCursor);
    } else {
      setUserResults(hit.items);
      setUserNextCursor(hit.nextCursor);
    }
    return true;
  }, []);

  const runSearch = useCallback(
    async (q: string, activeTab: SearchTab, cursor?: string) => {
      const isLoadMore = !!cursor;
      if (!isLoadMore) abortRef.current?.abort();

      if (!q || q.length < MIN_QUERY_LEN) {
        if (!isLoadMore) {
          setThemeResults([]);
          setUserResults([]);
          setThemeNextCursor(null);
          setUserNextCursor(null);
          setSearched(false);
          setFetching(false);
          setError("");
        }
        return;
      }

      const key = cacheKey(activeTab, q);
      if (!isLoadMore) {
        const hasCache = applyCache(key);
        if (hasCache) {
          setSearched(true);
          setError("");
        }
      }

      const controller = new AbortController();
      if (!isLoadMore) abortRef.current = controller;
      const requestId = ++requestIdRef.current;

      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        const hasCachedResults = cacheRef.current.has(key);
        if (!hasCachedResults) {
          setFetching(true);
        }
        setSearched(true);
        if (!hasCachedResults) setError("");
      }

      try {
        if (activeTab === "themes") {
          const page = await searchThemes(q, cursor, controller.signal);
          if (requestId !== requestIdRef.current) return;
          setThemeResults((prev) =>
            isLoadMore ? [...prev, ...page.results] : page.results,
          );
          setThemeNextCursor(page.next ?? null);
          if (!isLoadMore) {
            cacheRef.current.set(key, {
              kind: "themes",
              items: page.results,
              nextCursor: page.next ?? null,
            });
            pushRecentSearch("themes", q);
            setRecentSearches(readRecentSearches());
          }
        } else {
          const page = await searchUsers(q, cursor, controller.signal);
          if (requestId !== requestIdRef.current) return;
          setUserResults((prev) =>
            isLoadMore ? [...prev, ...page.results] : page.results,
          );
          setUserNextCursor(page.next ?? null);
          if (!isLoadMore) {
            cacheRef.current.set(key, {
              kind: "users",
              items: page.results,
              nextCursor: page.next ?? null,
            });
            pushRecentSearch("users", q);
            setRecentSearches(readRecentSearches());
          }
        }
        setError("");
      } catch (e) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!isLoadMore && !cacheRef.current.has(key)) {
          if (activeTab === "themes") setThemeResults([]);
          else setUserResults([]);
        }
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (requestId === requestIdRef.current) {
          if (isLoadMore) setLoadingMore(false);
          else setFetching(false);
        }
      }
    },
    [applyCache],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!trimmed || trimmed.length < MIN_QUERY_LEN) {
      runSearch("", tab);
      return;
    }

    debounceRef.current = setTimeout(() => runSearch(trimmed, tab), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tab, runSearch]);

  const showDiscover = !query.trim();
  const activeResults = tab === "themes" ? themeResults : userResults;
  const activeNextCursor = tab === "themes" ? themeNextCursor : userNextCursor;
  const queryTooShort = query.trim().length > 0 && query.trim().length < MIN_QUERY_LEN;
  const showEmpty =
    searched && !fetching && !error && query.trim().length >= MIN_QUERY_LEN && activeResults.length === 0;
  const resultsPanelId = tab === "themes" ? themesPanelId : usersPanelId;
  const listKey = `/search?tab=${tab}${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}`;

  useEffect(() => {
    setListKey(listKey);
  }, [listKey]);

  useRestoreAnchor(listKey, tab === "themes" && searched && !fetching && themeResults.length > 0);

  const loadMore = useCallback(() => {
    const trimmed = query.trim();
    const cursor = tab === "themes" ? themeNextCursor : userNextCursor;
    if (!trimmed || !cursor || fetching || loadingMore) return;
    void runSearch(trimmed, tab, cursor);
  }, [query, tab, themeNextCursor, userNextCursor, fetching, loadingMore, runSearch]);

  const sentinelRef = useInfiniteScroll({
    hasMore: !!activeNextCursor,
    loading: fetching || loadingMore,
    onLoadMore: loadMore,
  });

  function applyChip(value: string, chipTab: SearchTab) {
    setTab(chipTab);
    setQuery(chipTab === "themes" && !value.startsWith("#") ? `#${value}` : value);
  }

  const discoverItems = tab === "themes" ? discover.themes : discover.users;
  const popularItems = tab === "themes" ? popularQueries.themes : popularQueries.users;
  const recentItems = recentSearches.filter((r) => r.tab === tab);

  const searchLabel =
    tab === "themes" ? "Search themes or hashtags" : "Search users";

  return (
    <main>
      <PageHeader title="Search" showBack={false} />

      <div role="tablist" aria-label="Search type" className="search-tabs">
        <button
          type="button"
          role="tab"
          id={`${searchInputId}-tab-themes`}
          className={tab === "themes" ? "active" : ""}
          aria-selected={tab === "themes"}
          aria-controls={themesPanelId}
          onClick={() => setTab("themes")}
        >
          Themes & hashtags
        </button>
        <button
          type="button"
          role="tab"
          id={`${searchInputId}-tab-users`}
          className={tab === "users" ? "active" : ""}
          aria-selected={tab === "users"}
          aria-controls={usersPanelId}
          onClick={() => setTab("users")}
        >
          Users
        </button>
      </div>

      <form
        className="search-bar"
        role="search"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="sr-only" htmlFor={searchInputId}>
          {searchLabel}
        </label>
        <i className="fa fa-search" aria-hidden="true" />
        <input
          id={searchInputId}
          name="q"
          type="search"
          enterKeyHint="search"
          placeholder={
            tab === "themes" ? "Search themes or #hashtags…" : "Search users…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-controls={showDiscover ? undefined : resultsPanelId}
        />
        {fetching && (
          <span className="search-bar__spinner" role="status" aria-label="Searching" />
        )}
      </form>

      {showDiscover && (
        <div className="discover-search">
          <div className="discover-search__head">
            <h2 className="section-title">Discover</h2>
            <div className="discover-search__mode" role="group" aria-label="Discover mode">
              <button
                type="button"
                className={discoverMode === "popular" ? "active" : ""}
                aria-pressed={discoverMode === "popular"}
                onClick={() => setDiscoverMode("popular")}
              >
                Popular
              </button>
              <button
                type="button"
                className={discoverMode === "trending" ? "active" : ""}
                aria-pressed={discoverMode === "trending"}
                onClick={() => setDiscoverMode("trending")}
              >
                Trending
              </button>
            </div>
          </div>

          {discoverItems.length > 0 && (
            <div className="discover-search__group">
              <span className="discover-search__label">
                {tab === "themes"
                  ? discoverMode === "trending"
                    ? "Trending hashtags"
                    : "Popular hashtags"
                  : discoverMode === "trending"
                    ? "Trending accounts"
                    : "Popular accounts"}
              </span>
              <div className="discover-search__chips" role="group">
                {discoverItems.map((item) => (
                  <button
                    key={`d-${item}`}
                    type="button"
                    className="discover-search__chip"
                    onClick={() => applyChip(item, tab)}
                  >
                    {tab === "themes" ? `#${item}` : item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {popularItems.length > 0 && (
            <div className="discover-search__group">
              <span className="discover-search__label">Popular searches</span>
              <div className="discover-search__chips" role="group">
                {popularItems.map((item) => (
                  <button
                    key={`p-${item}`}
                    type="button"
                    className="discover-search__chip discover-search__chip--muted"
                    onClick={() => applyChip(item, tab)}
                  >
                    {tab === "themes" && !item.startsWith("#") ? `#${item}` : item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {recentItems.length > 0 && (
            <div className="discover-search__group">
              <span className="discover-search__label">Recent</span>
              <div className="discover-search__chips" role="group">
                {recentItems.map((item) => (
                  <button
                    key={`r-${item.tab}-${item.query}`}
                    type="button"
                    className="discover-search__chip discover-search__chip--recent"
                    onClick={() => applyChip(item.query, item.tab)}
                  >
                    {item.tab === "themes" && !item.query.startsWith("#")
                      ? `#${item.query}`
                      : item.query}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!showDiscover && (
        <div
          id={resultsPanelId}
          role="tabpanel"
          aria-labelledby={
            tab === "themes"
              ? `${searchInputId}-tab-themes`
              : `${searchInputId}-tab-users`
          }
          className={`search-results search-panel--visible${fetching ? " search-results--fetching" : ""}`}
        >
          {queryTooShort && (
            <p className="search-results__message muted">
              Type at least {MIN_QUERY_LEN} characters to search.
            </p>
          )}
          {error && (
            <p className="search-results__message muted" role="alert">
              {error}
            </p>
          )}
          {showEmpty && (
            <div className="search-results__empty">
              <p className="search-results__message muted">
                {tab === "themes" ? "No themes found." : "No users found."}
              </p>
              {discoverItems.length > 0 && (
                <div className="discover-search discover-search--inline">
                  <span className="discover-search__label">Try discovering</span>
                  <div className="discover-search__chips">
                    {discoverItems.slice(0, 4).map((item) => (
                      <button
                        key={`e-${item}`}
                        type="button"
                        className="discover-search__chip"
                        onClick={() => applyChip(item, tab)}
                      >
                        {tab === "themes" ? `#${item}` : item}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "themes" &&
            themeResults.map((t) => (
              <ThemeCard
                key={t.id}
                theme={t}
                onDeleted={() => setThemeResults((prev) => prev.filter((x) => x.id !== t.id))}
              />
            ))}

          {tab === "users" &&
            userResults.map((u) => (
              <Link key={u.id} href={`/u/${u.username}`} className="user-row user-row--search">
                <Avatar username={u.username} src={u.avatar} />
                <div className="user-row__main">
                  <span className="username">{u.username}</span>
                  {u.bio && <span className="user-row__bio">{u.bio}</span>}
                </div>
              </Link>
            ))}

          {activeNextCursor && (
            <>
              <div ref={sentinelRef} className="feed-sentinel" aria-hidden="true" />
              {loadingMore && <p className="muted search-results__message">Loading more…</p>}
            </>
          )}
        </div>
      )}
    </main>
  );
}
