"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import CardMenu from "@/components/CardMenu";
import ListExitWrap from "@/components/ListExitWrap";
import Avatar from "@/components/Avatar";
import MediaCarousel from "@/components/MediaCarousel";
import BodyHtml from "@/components/BodyHtml";
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
  isLoggedIn,
  toggleLike,
  toggleRepost,
} from "@/lib/api";
import { formatCompactNumber, formatRelativeTime } from "@/lib/i18n";
import { bouncePress } from "@/lib/nav-bounce";
import { saveReturnAnchorFromElement } from "@/lib/return-anchor";
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
  onOpen,
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
  onOpen?: () => void;
}) {
  const { t } = useTranslation("feed");
  const router = useRouter();
  const [liked, setLiked] = useState(theme.is_liked);
  const [likes, setLikes] = useState(theme.likes_count);
  const [reposted, setReposted] = useState(theme.is_reposted);
  const [reposts, setReposts] = useState(theme.reposts_count);
  const [replies, setReplies] = useState(theme.replies_count);
  const [exiting, setExiting] = useState(false);
  const deletePending = useRef(false);
  const cardRef = useRef<HTMLElement>(null);

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
    // Оптимистично: обновляем UI сразу, не дожидаясь ответа сервера.
    const prevLiked = liked;
    const prevLikes = likes;
    const nextLiked = !prevLiked;
    const nextLikes = Math.max(0, prevLikes + (nextLiked ? 1 : -1));
    setLiked(nextLiked);
    setLikes(nextLikes);
    emitThemeLikeChanged({
      themeId: theme.id,
      liked: nextLiked,
      likes_count: nextLikes,
    });
    try {
      const r = await toggleLike(theme.id);
      setLiked(r.liked);
      setLikes(r.likes_count);
      if (r.liked !== nextLiked || r.likes_count !== nextLikes) {
        emitThemeLikeChanged({
          themeId: theme.id,
          liked: r.liked,
          likes_count: r.likes_count,
        });
      }
    } catch {
      setLiked(prevLiked);
      setLikes(prevLikes);
      emitThemeLikeChanged({
        themeId: theme.id,
        liked: prevLiked,
        likes_count: prevLikes,
      });
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
    const el = cardRef.current;
    if (el) {
      saveReturnAnchorFromElement(el, { kind: "theme", id: theme.id });
    }
    seedThreadTheme(theme);
    onOpen?.();
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
      <article ref={cardRef} className="card" data-anchor-theme={theme.id}>
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
            <span className="time">· {formatRelativeTime(theme.created_at)}</span>
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
          className={`body-html--boxed${clickable ? " body-html--clickable" : ""}`}
          onClick={onBodyClick}
        >
          {theme.body && <BodyHtml html={theme.body} />}
          {theme.media.length > 0 && <MediaCarousel media={theme.media} />}
        </div>

        <div className="actions">
          <button
            type="button"
            className={liked ? "active" : ""}
            onPointerDown={(e) => bouncePress(e.currentTarget)}
            onClick={onLike}
          >
            <i
              key={liked ? "liked" : "unliked"}
              className={liked ? "fa-solid fa-heart" : "fa-regular fa-heart"}
              aria-hidden="true"
            />{" "}
            {formatCompactNumber(likes)}
          </button>
          <button
            type="button"
            onPointerDown={(e) => bouncePress(e.currentTarget)}
            onClick={onReply}
          >
            <i className="fa-regular fa-comment" aria-hidden="true" />{" "}
            {formatCompactNumber(replies)}
          </button>
          <button
            type="button"
            className={reposted ? "active" : ""}
            onPointerDown={(e) => bouncePress(e.currentTarget)}
            onClick={onRepost}
          >
            <i className="fa-solid fa-retweet" aria-hidden="true" /> {formatCompactNumber(reposts)}
          </button>
          <button type="button" aria-label={t("common:send")} onPointerDown={(e) => bouncePress(e.currentTarget)}>
            <i className="fa-regular fa-paper-plane" aria-hidden="true" /> {formatCompactNumber(0)}
          </button>
        </div>
      </div>
    </article>
    </ListExitWrap>
  );
}
