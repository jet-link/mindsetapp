"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, MouseEvent } from "react";
import CardMenu from "@/components/CardMenu";
import Avatar from "@/components/Avatar";
import {
  REPLY_CREATED_EVENT,
  REPLY_LIKE_EVENT,
  REPLY_REPOST_EVENT,
  Reply,
  ReplyCreatedDetail,
  ReplyLikeDetail,
  ReplyRepostDetail,
  emitReplyLikeChanged,
  emitReplyRepostChanged,
  formatCount,
  isLoggedIn,
  toggleReplyLike,
  toggleReplyRepost,
} from "@/lib/api";
import { saveReturnAnchor } from "@/lib/return-anchor";

export default function ReplyCard({
  reply,
  showViewTheme = false,
  indented = false,
  clickable = false,
  threadLineBelow = false,
}: {
  reply: Reply;
  showViewTheme?: boolean;
  indented?: boolean;
  clickable?: boolean;
  threadLineBelow?: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(reply.is_liked);
  const [likes, setLikes] = useState(reply.likes_count);
  const [reposted, setReposted] = useState(reply.is_reposted);
  const [reposts, setReposts] = useState(reply.reposts_count);
  const [replies, setReplies] = useState(reply.replies_count);

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
    try {
      const r = await toggleReplyLike(reply.id);
      setLiked(r.liked);
      setLikes(r.likes_count);
      emitReplyLikeChanged({
        replyId: reply.id,
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
    try {
      const r = await toggleReplyRepost(reply.id);
      setReposted(r.reposted);
      setReposts(r.reposts_count);
      emitReplyRepostChanged({
        replyId: reply.id,
        reposted: r.reposted,
        reposts_count: r.reposts_count,
      });
    } catch {
      window.location.href = "/login";
    }
  }

  function onReplies() {
    router.push(`/reply/${reply.id}`);
  }

  function onBodyClick(e: MouseEvent<HTMLDivElement>) {
    if (!clickable) return;
    const target = e.target as HTMLElement;
    if (target.closest("a, button")) return;
    saveReturnAnchor({ kind: "reply", id: reply.id });
    router.push(`/reply/${reply.id}`);
  }

  return (
    <article className={`card${indented ? " card--reply" : ""}`} data-anchor-reply={reply.id}>
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
            <span className="time">· {reply.human_published}</span>
          </div>
          <CardMenu kind="reply" path={`/reply/${reply.id}`} authorUsername={reply.author.username} />
        </div>

        <div
          className={`body-html body-html--boxed${clickable ? " body-html--clickable" : ""}`}
          onClick={onBodyClick}
          dangerouslySetInnerHTML={{ __html: reply.body }}
        />

        <div className="actions">
          <button type="button" className={liked ? "active" : ""} onClick={onLike}>
            <i className={`fa ${liked ? "fa-heart" : "fa-heart-o"}`} aria-hidden="true" />{" "}
            {formatCount(likes)}
          </button>
          <button type="button" onClick={onReplies}>
            <i className="fa fa-comment-o" aria-hidden="true" />{" "}
            {formatCount(replies)}
          </button>
          <button type="button" className={reposted ? "active" : ""} onClick={onRepost}>
            <i className="fa fa-retweet" aria-hidden="true" /> {formatCount(reposts)}
          </button>
          {showViewTheme && (
            <Link href={`/thread/${reply.theme_id}`} className="view-theme">
              View theme
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
