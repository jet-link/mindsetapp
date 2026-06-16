"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import {
  UserPublic,
  AUTH_EVENT,
  USER_PROFILE_EVENT,
  UserProfileUpdatedDetail,
  emitFollowChanged,
  getFollowers,
  getFollowing,
  isLoggedIn,
  toggleFollow,
} from "@/lib/api";
import { patchUserPublicList } from "@/lib/user-avatar-store";

function UserRow({ user }: { user: UserPublic }) {
  const [following, setFollowing] = useState(!!user.is_following);
  const [isOwn, setIsOwn] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(isLoggedIn());
    setIsOwn(localStorage.getItem("mindset_username") === user.username);
    const onAuth = () => setAuthed(isLoggedIn());
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [user.username]);

  async function onToggle() {
    const optimistic = !following;
    setFollowing(optimistic);
    try {
      const r = await toggleFollow(user.username);
      setFollowing(r.following);
      const viewer = localStorage.getItem("mindset_username") ?? undefined;
      emitFollowChanged({
        profileUsername: user.username,
        followers_count: r.followers_count,
        viewerUsername: viewer,
        viewer_following_count: r.following_count,
      });
    } catch {
      setFollowing(!optimistic);
      window.location.href = "/login";
    }
  }

  return (
    <div className="user-row">
      <Link href={`/u/${user.username}`} className="user-row__link">
        <Avatar username={user.username} src={user.avatar} />
        <div className="user-row__main">
          <span className="username">{user.username}</span>
          {user.bio && <span className="user-row__bio">{user.bio}</span>}
        </div>
      </Link>

      {isOwn === false && authed && (
        <button
          type="button"
          className={`btn btn--sm ${following ? "" : "btn--ghost"}`}
          onClick={onToggle}
        >
          {following ? "Unfollow" : "Follow"}
        </button>
      )}
    </div>
  );
}

export default function FollowList({
  username,
  kind,
}: {
  username: string;
  kind: "followers" | "following";
}) {
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const cacheRef = useRef<Map<string, UserPublic[]>>(new Map());
  const usersRef = useRef<UserPublic[]>([]);

  const load = useCallback(
    async (q: string, cursor?: string) => {
      const requestId = ++requestIdRef.current;
      const cacheKey = `${kind}:${username}:${q}`;

      if (!cursor) {
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
          usersRef.current = cached;
          setUsers(cached);
          setInitialLoading(false);
          setFetching(false);
          setError("");
          return;
        }
        if (usersRef.current.length === 0) setInitialLoading(true);
        else setFetching(true);
      } else {
        setFetching(true);
      }
      setError("");

      try {
        const fetcher = kind === "followers" ? getFollowers : getFollowing;
        const page = await fetcher(username, cursor, q || undefined);
        if (requestId !== requestIdRef.current) return;
        const next = page.next
          ? new URL(page.next, "http://x").searchParams.get("cursor")
          : null;
        if (cursor) {
          const merged = [...usersRef.current, ...page.results];
          usersRef.current = merged;
          setUsers(merged);
        } else {
          usersRef.current = page.results;
          setUsers(page.results);
          cacheRef.current.set(cacheKey, page.results);
        }
        setNextCursor(next);
      } catch (e) {
        if (requestId !== requestIdRef.current) return;
        setError(e instanceof Error ? e.message : "Failed to load the list");
      } finally {
        if (requestId === requestIdRef.current) {
          setInitialLoading(false);
          setFetching(false);
        }
      }
    },
    [username, kind],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(query.trim()), 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, load]);

  useEffect(() => {
    const onProfileUpdated = (e: Event) => {
      const { username: changed, avatar } = (e as CustomEvent<UserProfileUpdatedDetail>).detail;
      if (avatar === undefined) return;
      setUsers((prev) => {
        const next = patchUserPublicList(prev, changed, avatar);
        usersRef.current = next;
        return next;
      });
      for (const [key, list] of cacheRef.current.entries()) {
        cacheRef.current.set(key, patchUserPublicList(list, changed, avatar));
      }
    };
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    return () => window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
  }, []);

  const showEmpty =
    !initialLoading && !fetching && users.length === 0 && !error;

  return (
    <div>
      <div className="search-bar search-bar--compact" role="search">
        <label className="sr-only" htmlFor="follow-list-search">
          Search users in list
        </label>
        <i className="fa fa-search" aria-hidden="true" />
        <input
          id="follow-list-search"
          name="q"
          type="search"
          placeholder="Search users…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {fetching && (
          <span className="search-bar__spinner" role="status" aria-label="Searching" />
        )}
      </div>

      {initialLoading && users.length === 0 && (
        <p className="muted page-status">Loading…</p>
      )}
      {error && <p className="muted">{error}</p>}
      {showEmpty && (
        <p className="muted">
          {query.trim()
            ? "No users match your search."
            : kind === "followers"
              ? "No followers yet."
              : "Not following anyone yet."}
        </p>
      )}

      <div className={`follow-list${fetching ? " follow-list--fetching" : ""}`}>
        {users.map((u) => (
          <UserRow key={u.id} user={u} />
        ))}
      </div>

      {nextCursor && !fetching && !query.trim() && (
        <p className="muted">
          <button type="button" className="link-btn" onClick={() => load("", nextCursor)}>
            Show more
          </button>
        </p>
      )}
    </div>
  );
}
