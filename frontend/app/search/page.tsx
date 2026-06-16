"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import ThemeCard from "@/components/ThemeCard";
import Avatar from "@/components/Avatar";
import {
  Theme,
  UserPublic,
  USER_PROFILE_EVENT,
  UserProfileUpdatedDetail,
  getFeed,
  getPopularSearches,
  searchUsers,
} from "@/lib/api";
import { patchThemeAuthors, patchUserPublicList } from "@/lib/user-avatar-store";

type SearchTab = "themes" | "users";

type CacheEntry =
  | { kind: "themes"; items: Theme[] }
  | { kind: "users"; items: UserPublic[] };

const DEBOUNCE_MS = 200;

function cacheKey(tab: SearchTab, q: string) {
  return `${tab}:${q.toLowerCase()}`;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("themes");
  const [themeResults, setThemeResults] = useState<Theme[]>([]);
  const [userResults, setUserResults] = useState<UserPublic[]>([]);
  const [popular, setPopular] = useState<{ themes: string[]; users: string[] }>({
    themes: [],
    users: [],
  });
  const [fetching, setFetching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const searchInputId = useId();
  const themesPanelId = useId();
  const usersPanelId = useId();

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    getPopularSearches()
      .then(setPopular)
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
            kind: "themes",
            items: patchThemeAuthors(entry.items, username, avatar),
          });
        } else {
          cacheRef.current.set(key, {
            kind: "users",
            items: patchUserPublicList(entry.items, username, avatar),
          });
        }
      }
    };
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    return () => window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
  }, []);

  const applyCache = useCallback((key: string) => {
    const hit = cacheRef.current.get(key);
    if (!hit) return false;
    if (hit.kind === "themes") setThemeResults(hit.items);
    else setUserResults(hit.items);
    return true;
  }, []);

  const runSearch = useCallback(
    async (q: string, activeTab: SearchTab) => {
      abortRef.current?.abort();
      if (!q) {
        setThemeResults([]);
        setUserResults([]);
        setSearched(false);
        setFetching(false);
        setError("");
        return;
      }

      const key = cacheKey(activeTab, q);
      const hasCache = applyCache(key);
      if (hasCache) {
        setSearched(true);
        setError("");
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;

      setFetching(true);
      setSearched(true);
      if (!hasCache) setError("");

      try {
        if (activeTab === "themes") {
          const page = await getFeed("main", undefined, q, controller.signal);
          if (requestId !== requestIdRef.current) return;
          setThemeResults(page.results);
          cacheRef.current.set(key, { kind: "themes", items: page.results });
        } else {
          const page = await searchUsers(q, undefined, controller.signal);
          if (requestId !== requestIdRef.current) return;
          setUserResults(page.results);
          cacheRef.current.set(key, { kind: "users", items: page.results });
        }
        setError("");
      } catch (e) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!hasCache) {
          if (activeTab === "themes") setThemeResults([]);
          else setUserResults([]);
        }
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (requestId === requestIdRef.current) setFetching(false);
      }
    },
    [applyCache],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!trimmed) {
      runSearch("", tab);
      return;
    }

    debounceRef.current = setTimeout(() => runSearch(trimmed, tab), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tab, runSearch]);

  const showPopular = !query.trim();
  const activeResults = tab === "themes" ? themeResults : userResults;
  const showEmpty =
    searched && !fetching && !error && query.trim() && activeResults.length === 0;
  const resultsPanelId = tab === "themes" ? themesPanelId : usersPanelId;

  function applyPopular(value: string, popularTab: SearchTab) {
    setTab(popularTab);
    setQuery(popularTab === "themes" ? `#${value}` : value);
  }

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
          aria-controls={showPopular ? undefined : resultsPanelId}
        />
        {fetching && (
          <span className="search-bar__spinner" role="status" aria-label="Searching" />
        )}
      </form>

      {showPopular && (popular.themes.length > 0 || popular.users.length > 0) && (
        <section className="popular-search search-panel search-panel--visible">
          <h2 className="section-title">Popular queries</h2>
          {popular.themes.length > 0 && (
            <div className="popular-search__group">
              <span className="popular-search__label" id={`${searchInputId}-popular-themes`}>
                Themes & hashtags
              </span>
              <div
                className="popular-search__chips"
                role="group"
                aria-labelledby={`${searchInputId}-popular-themes`}
              >
                {popular.themes.map((t) => (
                  <button
                    key={`t-${t}`}
                    type="button"
                    className="popular-search__chip"
                    onClick={() => applyPopular(t, "themes")}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </div>
          )}
          {popular.users.length > 0 && (
            <div className="popular-search__group">
              <span className="popular-search__label" id={`${searchInputId}-popular-users`}>
                Users
              </span>
              <div
                className="popular-search__chips"
                role="group"
                aria-labelledby={`${searchInputId}-popular-users`}
              >
                {popular.users.map((u) => (
                  <button
                    key={`u-${u}`}
                    type="button"
                    className="popular-search__chip"
                    onClick={() => applyPopular(u, "users")}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {!showPopular && (
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
          {error && (
            <p className="search-results__message muted" role="alert">
              {error}
            </p>
          )}
          {showEmpty && (
            <p className="search-results__message muted">
              {tab === "themes" ? "No themes found." : "No users found."}
            </p>
          )}

          {tab === "themes" &&
            themeResults.map((t) => <ThemeCard key={t.id} theme={t} />)}

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
        </div>
      )}
    </main>
  );
}
