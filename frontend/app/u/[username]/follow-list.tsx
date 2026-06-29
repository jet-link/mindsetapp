"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Avatar from "@/components/Avatar";
import ListExitWrap from "@/components/ListExitWrap";
import {
  UserPublic,
  AUTH_EVENT,
  FOLLOW_EVENT,
  FollowChangedDetail,
  USER_PROFILE_EVENT,
  UserProfileUpdatedDetail,
  emitFollowChanged,
  getFollowers,
  getFollowing,
  getStoredUsername,
  isLoggedIn,
  toggleFollow,
} from "@/lib/api";
import { patchUserPublicList } from "@/lib/user-avatar-store";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";

function UserRow({
  user,
  exiting,
  onExitComplete,
  onFollowingChange,
}: {
  user: UserPublic;
  exiting?: boolean;
  onExitComplete?: () => void;
  onFollowingChange?: (username: string, following: boolean) => void;
}) {
  const { t } = useTranslation("profile");
  const [following, setFollowing] = useState(!!user.is_following);
  const [isOwn, setIsOwn] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(isLoggedIn());
    setIsOwn(getStoredUsername() === user.username);
    const onAuth = () => setAuthed(isLoggedIn());
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [user.username]);

  async function onToggle() {
    const optimistic = !following;
    setFollowing(optimistic);
    if (!optimistic) onFollowingChange?.(user.username, false);
    try {
      const r = await toggleFollow(user.username);
      setFollowing(r.following);
      if (r.following !== optimistic) onFollowingChange?.(user.username, r.following);
      const viewer = getStoredUsername() ?? undefined;
      emitFollowChanged({
        profileUsername: user.username,
        following: r.following,
        followers_count: r.followers_count,
        viewerUsername: viewer,
        viewer_following_count: r.following_count,
      });
    } catch {
      setFollowing(!optimistic);
      if (!optimistic) onFollowingChange?.(user.username, true);
      window.location.href = "/login";
    }
  }

  return (
    <ListExitWrap exiting={exiting} onExitComplete={onExitComplete}>
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
            {following ? t("unfollow") : t("follow")}
          </button>
        )}
      </div>
    </ListExitWrap>
  );
}

export default function FollowList({
  username,
  kind,
}: {
  username: string;
  kind: "followers" | "following";
}) {
  const { t } = useTranslation("profile");
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
  const removedRef = useRef<Map<string, UserPublic>>(new Map());
  const [exitingUsernames, setExitingUsernames] = useState<Set<string>>(() => new Set());

  const patchCache = useCallback((list: UserPublic[]) => {
    for (const key of cacheRef.current.keys()) {
      if (key.startsWith(`${kind}:${username}:`)) {
        cacheRef.current.set(key, list);
      }
    }
  }, [kind, username]);

  const removeFromList = useCallback(
    (profileUsername: string) => {
      setUsers((prev) => {
        const removed = prev.find((u) => u.username === profileUsername);
        if (removed) removedRef.current.set(profileUsername, removed);
        const next = prev.filter((u) => u.username !== profileUsername);
        usersRef.current = next;
        patchCache(next);
        return next;
      });
      setExitingUsernames((prev) => {
        if (!prev.has(profileUsername)) return prev;
        const next = new Set(prev);
        next.delete(profileUsername);
        return next;
      });
    },
    [patchCache],
  );

  const beginExit = useCallback((profileUsername: string) => {
    setExitingUsernames((prev) => {
      if (prev.has(profileUsername)) return prev;
      const next = new Set(prev);
      next.add(profileUsername);
      return next;
    });
  }, []);

  const cancelExit = useCallback((profileUsername: string) => {
    setExitingUsernames((prev) => {
      if (!prev.has(profileUsername)) return prev;
      const next = new Set(prev);
      next.delete(profileUsername);
      return next;
    });
  }, []);

  const scheduleRemove = useCallback(
    (profileUsername: string) => {
      const isOwnFollowing = kind === "following" && username === getStoredUsername();
      if (isOwnFollowing) beginExit(profileUsername);
      else removeFromList(profileUsername);
    },
    [beginExit, kind, removeFromList, username],
  );

  const restoreToList = useCallback(
    (profileUsername: string) => {
      const user = removedRef.current.get(profileUsername);
      if (!user) return;
      removedRef.current.delete(profileUsername);
      setUsers((prev) => {
        if (prev.some((u) => u.username === profileUsername)) return prev;
        const next = [...prev, user];
        usersRef.current = next;
        patchCache(next);
        return next;
      });
    },
    [patchCache],
  );

  const handleFollowingChange = useCallback(
    (profileUsername: string, following: boolean) => {
      if (kind !== "following" || username !== getStoredUsername()) return;
      if (following) {
        cancelExit(profileUsername);
        restoreToList(profileUsername);
      } else {
        scheduleRemove(profileUsername);
      }
    },
    [cancelExit, kind, restoreToList, scheduleRemove, username],
  );

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
        setError(e instanceof Error ? e.message : t("failedToLoadList"));
      } finally {
        if (requestId === requestIdRef.current) {
          setInitialLoading(false);
          setFetching(false);
        }
      }
    },
    [username, kind, t],
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
    const onFollow = (e: Event) => {
      const { profileUsername, following } = (e as CustomEvent<FollowChangedDetail>).detail;
      if (kind !== "following" || following !== false) return;
      if (username !== getStoredUsername()) return;
      scheduleRemove(profileUsername);
    };
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    window.addEventListener(FOLLOW_EVENT, onFollow);
    return () => {
      window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
      window.removeEventListener(FOLLOW_EVENT, onFollow);
    };
  }, [kind, scheduleRemove, username]);

  const canLoadMore = !!nextCursor && !query.trim();
  const sentinelRef = useInfiniteScroll({
    hasMore: canLoadMore,
    loading: fetching,
    onLoadMore: () => {
      if (nextCursor) load("", nextCursor);
    },
  });

  const showEmpty =
    !initialLoading && !fetching && users.length === 0 && !error;

  return (
    <div>
      <div className="search-bar search-bar--compact" role="search">
        <label className="sr-only" htmlFor="follow-list-search">
          {t("searchUsersInList")}
        </label>
        <i className="fa fa-search" aria-hidden="true" />
        <input
          id="follow-list-search"
          name="q"
          type="search"
          placeholder={t("searchUsers")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {fetching && (
          <span className="search-bar__spinner" role="status" aria-label={t("search:searchingAria")} />
        )}
      </div>

      {initialLoading && users.length === 0 && (
        <p className="muted page-status">{t("common:loading")}</p>
      )}
      {error && <p className="muted">{error}</p>}
      {showEmpty && (
        <p className="muted">
          {query.trim()
            ? t("noUsersMatch")
            : kind === "followers"
              ? t("noFollowersYet")
              : t("notFollowingAnyone")}
        </p>
      )}

      <div className={`follow-list${fetching ? " follow-list--fetching" : ""}`}>
        {users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            exiting={exitingUsernames.has(u.username)}
            onExitComplete={() => removeFromList(u.username)}
            onFollowingChange={handleFollowingChange}
          />
        ))}
      </div>

      {canLoadMore && (
        <>
          <div ref={sentinelRef} className="feed-sentinel" aria-hidden="true" />
          {!fetching && (
            <p className="muted">
              <button type="button" className="link-btn" onClick={() => load("", nextCursor!)}>
                {t("common:showMore")}
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
