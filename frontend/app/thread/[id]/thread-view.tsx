"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ReplyCard from "@/components/ReplyCard";
import ThemeCard from "@/components/ThemeCard";
import ThreadRepliesLabel from "@/components/ThreadRepliesLabel";
import ReplyForm from "./reply-form";
import { Reply, Theme, REPLY_CREATED_EVENT, REPLY_DELETED_EVENT, REPLY_LIKE_EVENT, REPLY_REPOST_EVENT, ReplyCreatedDetail, ReplyDeletedDetail, ReplyLikeDetail, ReplyRepostDetail, THEME_LIKE_EVENT, THEME_REPOST_EVENT, ThemeLikeDetail, ThemeRepostDetail, USER_PROFILE_EVENT, UserProfileUpdatedDetail, getReplyDetail, getThread } from "@/lib/api";
import { getThreadCache, setThreadCache } from "@/lib/detail-cache";
import { setListKey } from "@/lib/return-anchor";
import { useRestoreAnchor } from "@/lib/use-restore-anchor";
import { patchReplyAuthors, patchThemeAuthors } from "@/lib/user-avatar-store";

// Загрузка на клиенте: JWT уходит вместе с запросом, поэтому
// is_liked / is_reposted совпадают с состоянием на стене.
export default function ThreadView({
  id,
  focusReplyId = null,
}: {
  id: number;
  focusReplyId?: number | null;
}) {
  const initialCache = getThreadCache(id);
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme | null>(initialCache?.theme ?? null);
  const [replies, setReplies] = useState<Reply[]>(initialCache?.replies ?? []);
  const [loading, setLoading] = useState(!initialCache || !!focusReplyId);
  const [error, setError] = useState("");
  const listKey = `/thread/${id}`;

  useEffect(() => {
    setListKey(listKey);
  }, [listKey]);

  useRestoreAnchor(listKey, !loading && !!theme, { scrollTopWhenNoAnchor: true });

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await getThread(id);
      setTheme(data.theme);
      if (focusReplyId) {
        const focused = data.replies.find((r) => r.id === focusReplyId);
        if (focused) {
          setReplies([focused]);
        } else {
          const detail = await getReplyDetail(focusReplyId);
          setReplies([detail.reply]);
        }
      } else {
        setReplies(data.replies);
        setThreadCache(id, { theme: data.theme, replies: data.replies });
      }
    } catch {
      setError("Thread not found or the API is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [id, focusReplyId]);

  useEffect(() => {
    if (focusReplyId) {
      load();
      return;
    }
    const snap = getThreadCache(id);
    if (snap) {
      setTheme(snap.theme);
      setReplies(snap.replies);
      setLoading(false);
      return;
    }
    load();
  }, [id, focusReplyId, load]);

  useEffect(() => {
    if (focusReplyId || pathname !== `/thread/${id}`) return;
    const snap = getThreadCache(id);
    if (!snap) return;
    setTheme(snap.theme);
    setReplies(snap.replies);
  }, [pathname, id, focusReplyId]);

  useEffect(() => {
    const onProfileUpdated = (e: Event) => {
      const { username, avatar } = (e as CustomEvent<UserProfileUpdatedDetail>).detail;
      if (avatar === undefined) return;
      setTheme((prev) =>
        prev && prev.author.username === username
          ? { ...prev, author: { ...prev.author, avatar } }
          : prev,
      );
      setReplies((prev) => patchReplyAuthors(prev, username, avatar));
    };
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    return () => window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
  }, []);

  useEffect(() => {
    const onReplyCreated = (e: Event) => {
      const { themeId, parentId, reply, themeRepliesCount, parentRepliesCount } = (
        e as CustomEvent<ReplyCreatedDetail>
      ).detail;
      if (themeId !== id) return;
      setTheme((prev) => (prev ? { ...prev, replies_count: themeRepliesCount } : prev));
      setReplies((prev) => {
        if (parentId === null) {
          if (prev.some((r) => r.id === reply.id)) return prev;
          return [reply, ...prev];
        }
        if (parentRepliesCount !== undefined) {
          return prev.map((r) =>
            r.id === parentId ? { ...r, replies_count: parentRepliesCount } : r,
          );
        }
        return prev;
      });
    };
    const onThemeLike = (e: Event) => {
      const { themeId, liked, likes_count } = (e as CustomEvent<ThemeLikeDetail>).detail;
      if (themeId !== id) return;
      setTheme((prev) => (prev ? { ...prev, is_liked: liked, likes_count } : prev));
    };
    const onThemeRepost = (e: Event) => {
      const { themeId, reposted, reposts_count } = (e as CustomEvent<ThemeRepostDetail>).detail;
      if (themeId !== id) return;
      setTheme((prev) =>
        prev ? { ...prev, is_reposted: reposted, reposts_count } : prev,
      );
    };
    const onReplyLike = (e: Event) => {
      const { replyId, liked, likes_count } = (e as CustomEvent<ReplyLikeDetail>).detail;
      setReplies((prev) =>
        prev.map((r) => (r.id === replyId ? { ...r, is_liked: liked, likes_count } : r)),
      );
    };
    const onReplyRepost = (e: Event) => {
      const { replyId, reposted, reposts_count } = (e as CustomEvent<ReplyRepostDetail>).detail;
      setReplies((prev) =>
        prev.map((r) =>
          r.id === replyId ? { ...r, is_reposted: reposted, reposts_count } : r,
        ),
      );
    };
    const onReplyDeleted = (e: Event) => {
      const { themeId, themeRepliesCount } = (e as CustomEvent<ReplyDeletedDetail>).detail;
      if (themeId !== id) return;
      setTheme((prev) => (prev ? { ...prev, replies_count: themeRepliesCount } : prev));
    };
    window.addEventListener(REPLY_CREATED_EVENT, onReplyCreated);
    window.addEventListener(THEME_LIKE_EVENT, onThemeLike);
    window.addEventListener(THEME_REPOST_EVENT, onThemeRepost);
    window.addEventListener(REPLY_LIKE_EVENT, onReplyLike);
    window.addEventListener(REPLY_REPOST_EVENT, onReplyRepost);
    window.addEventListener(REPLY_DELETED_EVENT, onReplyDeleted);
    return () => {
      window.removeEventListener(REPLY_CREATED_EVENT, onReplyCreated);
      window.removeEventListener(THEME_LIKE_EVENT, onThemeLike);
      window.removeEventListener(THEME_REPOST_EVENT, onThemeRepost);
      window.removeEventListener(REPLY_LIKE_EVENT, onReplyLike);
      window.removeEventListener(REPLY_REPOST_EVENT, onReplyRepost);
      window.removeEventListener(REPLY_DELETED_EVENT, onReplyDeleted);
    };
  }, [id, router]);

  if (loading && !theme) {
    return (
      <main>
        <PageHeader title="Theme detail" />
        <p className="muted page-status">Loading…</p>
      </main>
    );
  }
  if (error || !theme) {
    return (
      <main>
        <PageHeader title="Theme detail" />
        <p className="muted page-status">{error}</p>
      </main>
    );
  }

  return (
    <main className="page-fade-in">
      <PageHeader title="Theme detail" />
      <ReplyForm themeId={theme.id} onPosted={load} />
      <div className="thread-chain">
        <ThemeCard
          theme={theme}
          clickable={false}
          threadLineBelow={replies.length > 0}
          onDeleted={() => router.push("/")}
        />
        {replies.length > 0 && <ThreadRepliesLabel />}
        <div className="thread-replies">
          {replies.length === 0 && <p className="muted">No replies yet.</p>}
          {replies.map((r, i) => (
            <ReplyCard
              key={r.id}
              reply={r}
              indented
              clickable
              threadLineBelow={i < replies.length - 1}
              onDeleted={() => setReplies((prev) => prev.filter((x) => x.id !== r.id))}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
