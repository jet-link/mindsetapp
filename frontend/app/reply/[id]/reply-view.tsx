"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ReplyCard from "@/components/ReplyCard";
import ThreadRepliesLabel from "@/components/ThreadRepliesLabel";
import ReplyForm from "@/app/thread/[id]/reply-form";
import { Reply, REPLY_CREATED_EVENT, REPLY_DELETED_EVENT, REPLY_LIKE_EVENT, REPLY_REPOST_EVENT, ReplyCreatedDetail, ReplyDeletedDetail, ReplyLikeDetail, ReplyRepostDetail, USER_PROFILE_EVENT, UserProfileUpdatedDetail, getReplyDetail } from "@/lib/api";
import { getReplyDetailCache, setReplyDetailCache } from "@/lib/detail-cache";
import { setListKey } from "@/lib/return-anchor";
import { useRestoreAnchor } from "@/lib/use-restore-anchor";
import { patchReplyAuthors } from "@/lib/user-avatar-store";

// Страница «ответы на ответ»: сам ответ + его дочерние ответы.
export default function ReplyThreadView({
  id,
  focusReplyId = null,
}: {
  id: number;
  focusReplyId?: number | null;
}) {
  const initialCache = getReplyDetailCache(id);
  const pathname = usePathname();
  const router = useRouter();
  const [reply, setReply] = useState<Reply | null>(initialCache?.reply ?? null);
  const [children, setChildren] = useState<Reply[]>(initialCache?.children ?? []);
  const [loading, setLoading] = useState(!initialCache || !!focusReplyId);
  const [error, setError] = useState("");
  const listKey = `/reply/${id}`;

  useEffect(() => {
    setListKey(listKey);
  }, [listKey]);

  useRestoreAnchor(listKey, !loading && !!reply, { scrollTopWhenNoAnchor: true });

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await getReplyDetail(id);
      setReply(data.reply);
      if (focusReplyId) {
        const focused = data.replies.find((r) => r.id === focusReplyId);
        setChildren(focused ? [focused] : []);
      } else {
        setChildren(data.replies);
        setReplyDetailCache(id, { reply: data.reply, children: data.replies });
      }
    } catch {
      setError("Reply not found or the API is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [id, focusReplyId]);

  useEffect(() => {
    if (focusReplyId) {
      load();
      return;
    }
    const snap = getReplyDetailCache(id);
    if (snap) {
      setReply(snap.reply);
      setChildren(snap.children);
      setLoading(false);
      return;
    }
    load();
  }, [id, focusReplyId, load]);

  useEffect(() => {
    if (focusReplyId || pathname !== `/reply/${id}`) return;
    const snap = getReplyDetailCache(id);
    if (!snap) return;
    setReply(snap.reply);
    setChildren(snap.children);
  }, [pathname, id, focusReplyId]);

  useEffect(() => {
    const onProfileUpdated = (e: Event) => {
      const { username, avatar } = (e as CustomEvent<UserProfileUpdatedDetail>).detail;
      if (avatar === undefined) return;
      setReply((prev) =>
        prev && prev.author.username === username
          ? { ...prev, author: { ...prev.author, avatar } }
          : prev,
      );
      setChildren((prev) => patchReplyAuthors(prev, username, avatar));
    };
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    return () => window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
  }, []);

  useEffect(() => {
    const onReplyCreated = (e: Event) => {
      const { parentId, reply, parentRepliesCount } = (e as CustomEvent<ReplyCreatedDetail>).detail;
      if (parentId !== id) return;
      if (parentRepliesCount !== undefined) {
        setReply((prev) => (prev ? { ...prev, replies_count: parentRepliesCount } : prev));
      }
      setChildren((prev) => {
        if (prev.some((r) => r.id === reply.id)) return prev;
        return [reply, ...prev];
      });
    };
    const onReplyLike = (e: Event) => {
      const { replyId, liked, likes_count } = (e as CustomEvent<ReplyLikeDetail>).detail;
      setReply((prev) =>
        prev && prev.id === replyId ? { ...prev, is_liked: liked, likes_count } : prev,
      );
      setChildren((prev) =>
        prev.map((r) => (r.id === replyId ? { ...r, is_liked: liked, likes_count } : r)),
      );
    };
    const onReplyRepost = (e: Event) => {
      const { replyId, reposted, reposts_count } = (e as CustomEvent<ReplyRepostDetail>).detail;
      setReply((prev) =>
        prev && prev.id === replyId
          ? { ...prev, is_reposted: reposted, reposts_count }
          : prev,
      );
      setChildren((prev) =>
        prev.map((r) =>
          r.id === replyId ? { ...r, is_reposted: reposted, reposts_count } : r,
        ),
      );
    };
    const onReplyDeleted = (e: Event) => {
      const { replyId, themeId, parentId, parentRepliesCount } = (
        e as CustomEvent<ReplyDeletedDetail>
      ).detail;
      if (replyId === id) return;
      if (parentId === id && parentRepliesCount !== undefined) {
        setReply((prev) => (prev ? { ...prev, replies_count: parentRepliesCount } : prev));
      }
    };
    window.addEventListener(REPLY_CREATED_EVENT, onReplyCreated);
    window.addEventListener(REPLY_LIKE_EVENT, onReplyLike);
    window.addEventListener(REPLY_REPOST_EVENT, onReplyRepost);
    window.addEventListener(REPLY_DELETED_EVENT, onReplyDeleted);
    return () => {
      window.removeEventListener(REPLY_CREATED_EVENT, onReplyCreated);
      window.removeEventListener(REPLY_LIKE_EVENT, onReplyLike);
      window.removeEventListener(REPLY_REPOST_EVENT, onReplyRepost);
      window.removeEventListener(REPLY_DELETED_EVENT, onReplyDeleted);
    };
  }, [id, router]);

  if (loading && !reply) {
    return (
      <main>
        <PageHeader title="Reply detail" />
        <p className="muted page-status">Loading…</p>
      </main>
    );
  }
  if (error || !reply) {
    return (
      <main>
        <PageHeader title="Reply detail" />
        <p className="muted page-status">{error}</p>
      </main>
    );
  }

  return (
    <main className="page-fade-in">
      <PageHeader title="Reply detail" />
      <ReplyForm themeId={reply.theme_id} parentId={reply.id} onPosted={load} />
      <div className="thread-chain">
        <ReplyCard
          reply={reply}
          threadLineBelow={children.length > 0}
          onDeleted={() => router.push(`/thread/${reply.theme_id}`)}
        />
        {children.length > 0 && <ThreadRepliesLabel />}
        <div className="thread-replies">
          {children.length === 0 && <p className="muted">No replies yet.</p>}
          {children.map((r, i) => (
            <ReplyCard
              key={r.id}
              reply={r}
              indented
              clickable
              threadLineBelow={i < children.length - 1}
              onDeleted={() => setChildren((prev) => prev.filter((x) => x.id !== r.id))}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
