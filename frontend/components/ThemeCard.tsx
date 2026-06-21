"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, MouseEvent } from "react";
import CardMenu from "@/components/CardMenu";
import ListExitWrap from "@/components/ListExitWrap";
import Avatar from "@/components/Avatar";
import {
  REPLY_CREATED_EVENT,
  ReplyCreatedDetail,
  THEME_LIKE_EVENT,
  THEME_REPOST_EVENT,
  Theme,
  ThemeLikeDetail,
  ThemeRepostDetail,
  emitThemeDeleted,
  emitThemeLikeChanged,
  emitThemeRepostChanged,
  formatCount,
  isLoggedIn,
  toggleLike,
  toggleRepost,
} from "@/lib/api";
import { bouncePress } from "@/lib/nav-bounce";
import { saveReturnAnchor } from "@/lib/return-anchor";
import { seedThreadTheme } from "@/lib/detail-cache";


export default function ThemeCard({
  theme,
  clickable = true,
  threadLineBelow = false,
  onRepostChange,
  onDeleted,
  listExitViaParent = false,
  onDeleteExitStart,
  onDeleteExitFailed,
}: {
  theme: Theme;
  clickable?: boolean;
  threadLineBelow?: boolean;
  onRepostChange?: (
    themeId: number,
    reposted: boolean,
    options?: { theme?: Theme; immediate?: boolean },
  ) => void;
  onDeleted?: () => void;
  listExitViaParent?: boolean;
  onDeleteExitStart?: () => void;
  onDeleteExitFailed?: () => void;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(theme.is_liked);
  const [likes, setLikes] = useState(theme.likes_count);
  const [reposted, setReposted] = useState(theme.is_reposted);
  const [reposts, setReposts] = useState(theme.reposts_count);
  const [replies, setReplies] = useState(theme.replies_count);
  const [exiting, setExiting] = useState(false);
  const deletePending = useRef(false);

  useEffect(() => {
    setReplies(theme.replies_count);
  }, [theme.id, theme.replies_count]);

  useEffect(() => {
    setLiked(theme.is_liked);
    setLikes(theme.likes_count);
    setReposted(theme.is_reposted);
    setReposts(theme.reposts_count);
  }, [
    theme.id,
    theme.is_liked,
    theme.likes_count,
    theme.is_reposted,
    theme.reposts_count,
  ]);

  useEffect(() => {
    const onReplyCreated = (e: Event) => {
      const { themeId, themeRepliesCount } = (e as CustomEvent<ReplyCreatedDetail>).detail;
      if (themeId === theme.id) setReplies(themeRepliesCount);
    };
    const onThemeLike = (e: Event) => {
      const { themeId, liked, likes_count } = (e as CustomEvent<ThemeLikeDetail>).detail;
      if (themeId === theme.id) {
        setLiked(liked);
        setLikes(likes_count);
      }
    };
    const onThemeRepost = (e: Event) => {
      const { themeId, reposted, reposts_count } = (e as CustomEvent<ThemeRepostDetail>).detail;
      if (themeId === theme.id) {
        setReposted(reposted);
        setReposts(reposts_count);
      }
    };
    window.addEventListener(REPLY_CREATED_EVENT, onReplyCreated);
    window.addEventListener(THEME_LIKE_EVENT, onThemeLike);
    window.addEventListener(THEME_REPOST_EVENT, onThemeRepost);
    return () => {
      window.removeEventListener(REPLY_CREATED_EVENT, onReplyCreated);
      window.removeEventListener(THEME_LIKE_EVENT, onThemeLike);
      window.removeEventListener(THEME_REPOST_EVENT, onThemeRepost);
    };
  }, [theme.id]);

  async function onLike() {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    try {
      const r = await toggleLike(theme.id);
      setLiked(r.liked);
      setLikes(r.likes_count);
      emitThemeLikeChanged({
        themeId: theme.id,
        liked: r.liked,
        likes_count: r.likes_count,
      });
    } catch {
      window.location.href = "/login";
    }
  }

  async function onRepost() {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    const optimistic = !reposted;
    setReposted(optimistic);
    if (optimistic) {
      onRepostChange?.(theme.id, true, {
        theme: { ...theme, is_reposted: true, reposts_count: reposts + 1 },
      });
    } else {
      onRepostChange?.(theme.id, false);
    }
    try {
      const r = await toggleRepost(theme.id);
      setReposted(r.reposted);
      setReposts(r.reposts_count);
      if (r.reposted !== optimistic) {
        onRepostChange?.(theme.id, r.reposted, {
          theme: r.reposted
            ? { ...theme, is_reposted: true, reposts_count: r.reposts_count }
            : undefined,
          immediate: !r.reposted,
        });
      }
      emitThemeRepostChanged({
        themeId: theme.id,
        reposted: r.reposted,
        reposts_count: r.reposts_count,
      });
    } catch {
      setReposted(!optimistic);
      if (optimistic) {
        onRepostChange?.(theme.id, false, { immediate: true });
      } else {
        onRepostChange?.(theme.id, true);
      }
      window.location.href = "/login";
    }
  }

  function openThread() {
    saveReturnAnchor({ kind: "theme", id: theme.id });
    seedThreadTheme(theme);
    router.push(`/thread/${theme.id}`);
  }

  function onReply() {
    openThread();
  }

  function onBodyClick(e: MouseEvent<HTMLDivElement>) {
    if (!clickable) return;
    const target = e.target as HTMLElement;
    if (target.closest("a, button")) return;
    openThread();
  }

  return (
    <ListExitWrap
      exiting={listExitViaParent ? false : exiting}
      onExitComplete={
        listExitViaParent
          ? undefined
          : () => {
              if (deletePending.current) {
                emitThemeDeleted({ themeId: theme.id });
                deletePending.current = false;
              }
              onDeleted?.();
            }
      }
    >
      <article className="card" data-anchor-theme={theme.id}>
      <div
        className={`card-avatar-col${threadLineBelow ? " card-avatar-col--line" : ""}`}
      >
        <Link href={`/u/${theme.author.username}`} className="card-avatar">
          <Avatar username={theme.author.username} src={theme.author.avatar} />
        </Link>
        {threadLineBelow && <span className="card-thread-line" aria-hidden="true" />}
      </div>

      <div className="card-main">
        <div className="card-head">
          <div className="card-head__meta">
            <Link href={`/u/${theme.author.username}`} className="username">
              {theme.author.username}
            </Link>
            <span className="time">· {theme.human_published}</span>
          </div>
          <CardMenu
            kind="theme"
            path={`/thread/${theme.id}`}
            authorUsername={theme.author.username}
            itemId={theme.id}
            createdAt={theme.created_at}
            isDeletable={theme.is_deletable}
            onDeleteStart={() => {
              if (!listExitViaParent) setExiting(true);
            }}
            onDeleteSuccess={() => {
              if (listExitViaParent) {
                onDeleteExitStart?.();
                return;
              }
              deletePending.current = true;
            }}
            onDeleteFailed={() => {
              if (listExitViaParent) {
                onDeleteExitFailed?.();
                return;
              }
              setExiting(false);
            }}
          />
        </div>

        <div
          className={`body-html body-html--boxed${clickable ? " body-html--clickable" : ""}`}
          onClick={onBodyClick}
          dangerouslySetInnerHTML={{ __html: theme.body }}
        />

        {theme.images.length > 0 && (
          <div className="card-media">
            {theme.images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.id}
                src={img.medium_url}
                srcSet={img.srcset}
                sizes="(max-width: 620px) 90vw, 560px"
                alt=""
              />
            ))}
          </div>
        )}

        <div className="actions">
          <button
            type="button"
            className={liked ? "active" : ""}
            onPointerDown={(e) => bouncePress(e.currentTarget)}
            onClick={onLike}
          >
            <i className={`fa ${liked ? "fa-heart" : "fa-heart-o"}`} aria-hidden="true" />{" "}
            {formatCount(likes)}
          </button>
          <button
            type="button"
            onPointerDown={(e) => bouncePress(e.currentTarget)}
            onClick={onReply}
          >
            <i className="fa fa-comment" aria-hidden="true" />{" "}
            {formatCount(replies)}
          </button>
          <button
            type="button"
            className={reposted ? "active" : ""}
            onPointerDown={(e) => bouncePress(e.currentTarget)}
            onClick={onRepost}
          >
            <i className="fa fa-refresh" aria-hidden="true" /> {formatCount(reposts)}
          </button>
          {/* Share theme (bullhorn) — отключено, вернём позже
          <button type="button" aria-label="Share theme" onClick={onShare}>
            <i className="fa fa-bullhorn" aria-hidden="true" /> {formatCount(shares)}
          </button>
          */}
        </div>
      </div>
    </article>
    </ListExitWrap>
  );
}
