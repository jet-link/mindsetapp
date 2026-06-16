"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, MouseEvent } from "react";
import CardMenu from "@/components/CardMenu";
import Avatar from "@/components/Avatar";
import {
  REPLY_CREATED_EVENT,
  ReplyCreatedDetail,
  Theme,
  emitThemeLikeChanged,
  emitThemeRepostChanged,
  formatCount,
  isLoggedIn,
  toggleLike,
  toggleRepost,
} from "@/lib/api";


export default function ThemeCard({
  theme,
  clickable = true,
  threadLineBelow = false,
}: {
  theme: Theme;
  clickable?: boolean;
  threadLineBelow?: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(theme.is_liked);
  const [likes, setLikes] = useState(theme.likes_count);
  const [reposted, setReposted] = useState(theme.is_reposted);
  const [reposts, setReposts] = useState(theme.reposts_count);
  const [replies, setReplies] = useState(theme.replies_count);

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
    window.addEventListener(REPLY_CREATED_EVENT, onReplyCreated);
    return () => window.removeEventListener(REPLY_CREATED_EVENT, onReplyCreated);
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
    try {
      const r = await toggleRepost(theme.id);
      setReposted(r.reposted);
      setReposts(r.reposts_count);
      emitThemeRepostChanged({
        themeId: theme.id,
        reposted: r.reposted,
        reposts_count: r.reposts_count,
      });
    } catch {
      window.location.href = "/login";
    }
  }

  function onReply() {
    router.push(`/thread/${theme.id}`);
  }

  function onBodyClick(e: MouseEvent<HTMLDivElement>) {
    if (!clickable) return;
    const target = e.target as HTMLElement;
    if (target.closest("a, button")) return;
    router.push(`/thread/${theme.id}`);
  }

  return (
    <article className="card">
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
          <CardMenu kind="theme" path={`/thread/${theme.id}`} authorUsername={theme.author.username} />
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
          <button type="button" className={liked ? "active" : ""} onClick={onLike}>
            <i className={`fa ${liked ? "fa-heart" : "fa-heart-o"}`} aria-hidden="true" />{" "}
            {formatCount(likes)}
          </button>
          <button type="button" onClick={onReply}>
            <i className="fa fa-comment-o" aria-hidden="true" />{" "}
            {formatCount(replies)}
          </button>
          <button type="button" className={reposted ? "active" : ""} onClick={onRepost}>
            <i className="fa fa-retweet" aria-hidden="true" /> {formatCount(reposts)}
          </button>
          {/* Share theme (bullhorn) — отключено, вернём позже
          <button type="button" aria-label="Share theme" onClick={onShare}>
            <i className="fa fa-bullhorn" aria-hidden="true" /> {formatCount(shares)}
          </button>
          */}
        </div>
      </div>
    </article>
  );
}
