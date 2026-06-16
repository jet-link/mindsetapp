"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Avatar from "@/components/Avatar";
import {
  UserProfile,
  USER_PROFILE_EVENT,
  UserProfileUpdatedDetail,
  emitFollowChanged,
  formatCount,
  getProfile,
  isLoggedIn,
  toggleFollow,
} from "@/lib/api";

function mentionUsername(link: HTMLAnchorElement): string {
  const data = link.getAttribute("data-username");
  if (data) return data;
  const match = link.getAttribute("href")?.match(/\/u\/([^/?#]+)/);
  return match?.[1] ?? link.textContent?.replace(/^@/, "") ?? "";
}

function hideCard(
  setAnchor: (v: HTMLAnchorElement | null) => void,
  setProfile: (v: UserProfile | null) => void,
  setCardPos: (v: { top: number; left: number } | null) => void,
  hideTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
) {
  if (hideTimer.current) clearTimeout(hideTimer.current);
  setAnchor(null);
  setProfile(null);
  setCardPos(null);
}

export default function MentionHoverLayer() {
  const pathname = usePathname();
  const [anchor, setAnchor] = useState<HTMLAnchorElement | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const cacheRef = useRef(new Map<string, UserProfile>());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hideCard(setAnchor, setProfile, setCardPos, hideTimer);
  }, [pathname]);

  useEffect(() => {
    const onProfileUpdated = (e: Event) => {
      const { username, avatar, bio } = (e as CustomEvent<UserProfileUpdatedDetail>).detail;
      if (username && avatar !== undefined) {
        const cached = cacheRef.current.get(username);
        if (cached) {
          const updated = { ...cached, avatar };
          cacheRef.current.set(username, updated);
          setProfile((p) => (p?.username === username ? { ...p, avatar } : p));
        }
      }
      if (username && bio !== undefined) {
        const cached = cacheRef.current.get(username);
        if (cached) {
          const updated = { ...cached, bio };
          cacheRef.current.set(username, updated);
          setProfile((p) => (p?.username === username ? { ...p, bio } : p));
        }
      }
    };
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    return () => window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
  }, []);

  useEffect(() => {
    const clearHide = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = null;
    };

    const scheduleHide = () => {
      clearHide();
      hideTimer.current = setTimeout(() => {
        hideCard(setAnchor, setProfile, setCardPos, hideTimer);
      }, 180);
    };

    const show = (link: HTMLAnchorElement) => {
      clearHide();
      const username = mentionUsername(link);
      if (!username) return;
      setCardPos(null);
      setAnchor(link);
      const cached = cacheRef.current.get(username);
      if (cached) {
        setProfile(cached);
        setFollowing(cached.is_following);
      } else {
        setProfile(null);
        getProfile(username)
          .then((p) => {
            cacheRef.current.set(username, p);
            setProfile(p);
            setFollowing(p.is_following);
          })
          .catch(() => setProfile(null));
      }
    };

    const onOver = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest("a.mindset-mention") as HTMLAnchorElement | null;
      if (link) show(link);
    };

    const onOut = (e: MouseEvent) => {
      const to = e.relatedTarget as HTMLElement | null;
      if (to?.closest("a.mindset-mention") || to?.closest(".mention-hover-card")) return;
      scheduleHide();
    };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      clearHide();
    };
  }, []);

  const CARD_WIDTH = 320;
  const CARD_GAP = 10;
  const VIEWPORT_PAD = 12;

  useLayoutEffect(() => {
    if (!anchor || !cardRef.current) {
      setCardPos(null);
      return;
    }

    const updatePosition = () => {
      if (!anchor || !cardRef.current) return;
      const rect = anchor.getBoundingClientRect();
      const cardHeight = cardRef.current.offsetHeight;
      const cardWidth = CARD_WIDTH;

      let left = rect.left + rect.width / 2 - cardWidth / 2;
      left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - cardWidth - VIEWPORT_PAD));

      const spaceBelow = window.innerHeight - rect.bottom - CARD_GAP;
      const spaceAbove = rect.top - CARD_GAP;
      let top: number;

      if (spaceBelow >= cardHeight || spaceBelow >= spaceAbove) {
        top = rect.bottom + CARD_GAP;
      } else {
        top = rect.top - CARD_GAP - cardHeight;
      }

      top = Math.max(
        VIEWPORT_PAD,
        Math.min(top, window.innerHeight - cardHeight - VIEWPORT_PAD),
      );

      setCardPos({ top, left });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [anchor, profile, following, busy]);

  if (!anchor) return null;

  const rect = anchor.getBoundingClientRect();
  const cardWidth = CARD_WIDTH;
  const fallbackLeft = Math.max(
    VIEWPORT_PAD,
    Math.min(
      rect.left + rect.width / 2 - cardWidth / 2,
      window.innerWidth - cardWidth - VIEWPORT_PAD,
    ),
  );
  const top = cardPos?.top ?? rect.bottom + CARD_GAP;
  const left = cardPos?.left ?? fallbackLeft;

  const me = typeof window !== "undefined" ? localStorage.getItem("mindset_username") : null;
  const isOwn = profile?.username === me;

  const dismiss = () => hideCard(setAnchor, setProfile, setCardPos, hideTimer);

  async function onFollow(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!profile || !isLoggedIn()) {
      window.location.href = "/login";
      return;
    }
    const optimistic = !following;
    setFollowing(optimistic);
    setBusy(true);
    try {
      const r = await toggleFollow(profile.username);
      setFollowing(r.following);
      const updated = {
        ...profile,
        is_following: r.following,
        followers_count: r.followers_count,
      };
      setProfile(updated);
      cacheRef.current.set(profile.username, updated);
      emitFollowChanged({
        profileUsername: profile.username,
        followers_count: r.followers_count,
        viewerUsername: me ?? undefined,
        viewer_following_count: r.following_count,
      });
    } catch {
      setFollowing(!optimistic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={cardRef}
      className="mention-hover-card"
      style={{
        position: "fixed",
        top,
        left,
        width: cardWidth,
        zIndex: 120,
      }}
      onMouseEnter={() => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
      }}
      onMouseLeave={() => {
        hideTimer.current = setTimeout(() => {
          hideCard(setAnchor, setProfile, setCardPos, hideTimer);
        }, 180);
      }}
    >
      {profile ? (
        <>
          <Link
            href={`/u/${profile.username}`}
            className="mention-hover-card__link"
            onClick={dismiss}
          >
            <div className="mention-hover-card__head">
              <div className="mention-hover-card__identity">
                <div className="mention-hover-card__name">{profile.username}</div>
                <div className="mention-hover-card__handle">@{profile.username}</div>
              </div>
              <div className="mention-hover-card__avatar">
                <Avatar username={profile.username} src={profile.avatar} />
              </div>
            </div>
            {profile.bio ? (
              <div className="mention-hover-card__bio">{profile.bio}</div>
            ) : null}
            <div className="mention-hover-card__stats">
              {formatCount(profile.followers_count)} followers
              <span className="mention-hover-card__sep"> · </span>
              {formatCount(profile.following_count)} following
            </div>
          </Link>
          {!isOwn && (
            <button
              type="button"
              className={`mention-hover-card__follow${following ? " mention-hover-card__follow--active" : ""}`}
              onClick={onFollow}
              disabled={busy}
            >
              {following ? "Following" : "Follow"}
            </button>
          )}
        </>
      ) : (
        <p className="muted mention-hover-card__loading">Loading…</p>
      )}
    </div>
  );
}
