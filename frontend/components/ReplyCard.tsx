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
  REPLY_LIKE_EVENT,
  REPLY_REPOST_EVENT,
  Reply,
  ReplyCreatedDetail,
  ReplyLikeDetail,
  ReplyRepostDetail,
  type ReplyDeletedDetail,
  emitReplyDeleted,
  emitReplyLikeChanged,
  emitReplyRepostChanged,
  isLoggedIn,
  toggleReplyLike,
  toggleReplyRepost,
} from "@/lib/api";
import { formatCompactNumber, formatRelativeTime } from "@/lib/i18n";
import { bouncePress } from "@/lib/nav-bounce";
import { saveReturnAnchorFromElement } from "@/lib/return-anchor";
import { seedReplyDetailReply } from "@/lib/detail-cache";

export default function ReplyCard({
  reply,
  showViewTheme = false,
  showReplyBadge = false,
  indented = false,
  clickable = false,
  threadLineBelow = false,
  onRepostChange,
  onDeleted,
  listExitViaParent = false,
  onDeleteExitStart,
  onDeleteExitFailed,
}: {
  reply: Reply;
  showViewTheme?: boolean;
  showReplyBadge?: boolean;
  indented?: boolean;
  clickable?: boolean;
  threadLineBelow?: boolean;
  onRepostChange?: (
    replyId: number,
    reposted: boolean,
    options?: { reply?: Reply; immediate?: boolean },
  ) => void;
  onDeleted?: () => void;
  listExitViaParent?: boolean;
  onDeleteExitStart?: (detail: ReplyDeletedDetail) => void;
  onDeleteExitFailed?: () => void;
}) {
  const { t } = useTranslation("feed");
  const router = useRouter();
  const [liked, setLiked] = useState(reply.is_liked);
  const [likes, setLikes] = useState(reply.likes_count);
  const [reposted, setReposted] = useState(reply.is_reposted);
  const [reposts, setReposts] = useState(reply.reposts_count);
  const [replies, setReplies] = useState(reply.replies_count);
  const [exiting, setExiting] = useState(false);
  const deletePending = useRef<ReplyDeletedDetail | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  function saveReplyAnchor() {
    const el = cardRef.current;
    if (el) {
      saveReturnAnchorFromElement(el, { kind: "reply", id: reply.id });
    }
  }

  useEffect(() => {
    setReplies(reply.replies_count);
  }, [reply.id, reply.replies_count]);

  useEffect(() => {
    setLiked(reply.is_liked);
    setLikes(reply.likes_count);
    setReposted(reply.is_reposted);
    setReposts(reply.reposts_count);
  }, [
    reply.id,
    reply.is_liked,
    reply.likes_count,
    reply.is_reposted,
    reply.reposts_count,
  ]);

  useEffect(() => {
    const onReplyCreated = (e: Event) => {
      const { parentId, parentRepliesCount } = (e as CustomEvent<ReplyCreatedDetail>).detail;
      if (parentId === reply.id && parentRepliesCount !== undefined) {
        setReplies(parentRepliesCount);
      }
    };
    const onReplyLike = (e: Event) => {
      const { replyId, liked, likes_count } = (e as CustomEvent<ReplyLikeDetail>).detail;
      if (replyId === reply.id) {
        setLiked(liked);
        setLikes(likes_count);
      }
    };
    const onReplyRepost = (e: Event) => {
      const { replyId, reposted, reposts_count } = (e as CustomEvent<ReplyRepostDetail>).detail;
      if (replyId === reply.id) {
        setReposted(reposted);
        setReposts(reposts_count);
      }
    };
    window.addEventListener(REPLY_CREATED_EVENT, onReplyCreated);
    window.addEventListener(REPLY_LIKE_EVENT, onReplyLike);
    window.addEventListener(REPLY_REPOST_EVENT, onReplyRepost);
    return () => {
      window.removeEventListener(REPLY_CREATED_EVENT, onReplyCreated);
      window.removeEventListener(REPLY_LIKE_EVENT, onReplyLike);
      window.removeEventListener(REPLY_REPOST_EVENT, onReplyRepost);
    };
  }, [reply.id]);

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
    emitReplyLikeChanged({
      replyId: reply.id,
      liked: nextLiked,
      likes_count: nextLikes,
    });
    try {
      const r = await toggleReplyLike(reply.id);
      setLiked(r.liked);
      setLikes(r.likes_count);
      if (r.liked !== nextLiked || r.likes_count !== nextLikes) {
        emitReplyLikeChanged({
          replyId: reply.id,
          liked: r.liked,
          likes_count: r.likes_count,
        });
      }
    } catch {
      setLiked(prevLiked);
      setLikes(prevLikes);
      emitReplyLikeChanged({
        replyId: reply.id,
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
      onRepostChange?.(reply.id, true, {
        reply: { ...reply, is_reposted: true, reposts_count: reposts + 1 },
      });
    } else {
      onRepostChange?.(reply.id, false);
    }
    try {
      const r = await toggleReplyRepost(reply.id);
      setReposted(r.reposted);
      setReposts(r.reposts_count);
      if (r.reposted !== optimistic) {
        onRepostChange?.(reply.id, r.reposted, {
          reply: r.reposted
            ? { ...reply, is_reposted: true, reposts_count: r.reposts_count }
            : undefined,
          immediate: !r.reposted,
        });
      }
      emitReplyRepostChanged({
        replyId: reply.id,
        reposted: r.reposted,
        reposts_count: r.reposts_count,
      });
    } catch {
      setReposted(!optimistic);
      if (optimistic) {
        onRepostChange?.(reply.id, false, { immediate: true });
      } else {
        onRepostChange?.(reply.id, true);
      }
      window.location.href = "/login";
    }
  }

  function openReplyThread() {
    saveReplyAnchor();
    seedReplyDetailReply(reply);
    router.push(`/reply/${reply.id}`);
  }

  // Badge «Reply» (вкладка Reposts): ведёт к контексту репостнутого ответа —
  // на родительский ответ (ответ ответа) или на тему (ответ темы).
  function onBadgeNavigate(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    saveReplyAnchor();
    if (reply.parent_id != null) {
      router.push(`/reply/${reply.parent_id}`);
    } else {
      router.push(`/thread/${reply.theme_id}`);
    }
  }

  function onReplies() {
    openReplyThread();
  }

  function onBodyClick(e: MouseEvent<HTMLDivElement>) {
    if (!clickable) return;
    const target = e.target as HTMLElement;
    if (target.closest("a, button")) return;
    openReplyThread();
  }

  return (
    <ListExitWrap
      exiting={listExitViaParent ? false : exiting}
      onExitComplete={
        listExitViaParent
          ? undefined
          : () => {
              if (deletePending.current) {
                emitReplyDeleted(deletePending.current);
                deletePending.current = null;
              }
              onDeleted?.();
            }
      }
    >
      <article
        ref={cardRef}
        className={`card${indented ? " card--reply" : ""}`}
        data-anchor-reply={reply.id}
      >
      <div
        className={`card-avatar-col${threadLineBelow ? " card-avatar-col--line" : ""}`}
      >
        <Link href={`/u/${reply.author.username}`} className="card-avatar">
          <Avatar username={reply.author.username} src={reply.author.avatar} />
        </Link>
        {threadLineBelow && <span className="card-thread-line" aria-hidden="true" />}
      </div>

      <div className="card-main">
        <div className="card-head">
          <div className="card-head__meta">
            <Link href={`/u/${reply.author.username}`} className="username">
              {reply.author.username}
            </Link>
            <span className="time">· {formatRelativeTime(reply.created_at)}</span>
            {showReplyBadge && <span className="time">·</span>}
            {showReplyBadge && (
              <button
                type="button"
                className="card-badge card-badge--btn"
                onClick={onBadgeNavigate}
                aria-label={
                  reply.parent_id != null ? t("openParentReply") : t("openTheme")
                }
              >
                {t("replyBadge")}
              </button>
            )}
          </div>
          <CardMenu
            kind="reply"
            path={`/reply/${reply.id}`}
            authorUsername={reply.author.username}
            itemId={reply.id}
            createdAt={reply.created_at}
            isDeletable={reply.is_deletable}
            themeId={reply.theme_id}
            parentId={reply.parent_id}
            onDeleteStart={() => {
              if (!listExitViaParent) setExiting(true);
            }}
            onDeleteSuccess={(detail) => {
              if (listExitViaParent) {
                if (detail) onDeleteExitStart?.(detail);
                return;
              }
              if (detail) deletePending.current = detail;
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
          {reply.body && <BodyHtml html={reply.body} />}
          {reply.media.length > 0 && <MediaCarousel media={reply.media} />}
        </div>

        <div className="actions">
          <button
            type="button"
            className={liked ? "active" : ""}
            onPointerDown={(e) => bouncePress(e.currentTarget)}
            onClick={onLike}
          >
            <i className={`fa ${liked ? "fa-heart" : "fa-heart-o"}`} aria-hidden="true" />{" "}
            {formatCompactNumber(likes)}
          </button>
          <button
            type="button"
            onPointerDown={(e) => bouncePress(e.currentTarget)}
            onClick={onReplies}
          >
            <i className="fa fa-comment" aria-hidden="true" />{" "}
            {formatCompactNumber(replies)}
          </button>
          <button
            type="button"
            className={reposted ? "active" : ""}
            onPointerDown={(e) => bouncePress(e.currentTarget)}
            onClick={onRepost}
          >
            <i className="fa fa-refresh" aria-hidden="true" /> {formatCompactNumber(reposts)}
          </button>
          <button type="button" aria-label={t("common:send")} onPointerDown={(e) => bouncePress(e.currentTarget)}>
            <i className="fa fa-paper-plane" aria-hidden="true" /> {formatCompactNumber(0)}
          </button>
          {showViewTheme && (
            <Link href={`/thread/${reply.theme_id}`} className="view-theme">
              {t("viewTheme")}
            </Link>
          )}
        </div>
      </div>
    </article>
    </ListExitWrap>
  );
}
