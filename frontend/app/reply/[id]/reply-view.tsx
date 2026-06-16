"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import ReplyCard from "@/components/ReplyCard";
import ThreadRepliesLabel from "@/components/ThreadRepliesLabel";
import ReplyForm from "@/app/thread/[id]/reply-form";
import { Reply, USER_PROFILE_EVENT, UserProfileUpdatedDetail, getReplyDetail } from "@/lib/api";
import { patchReplyAuthors } from "@/lib/user-avatar-store";

// Страница «ответы на ответ»: сам ответ + его дочерние ответы.
export default function ReplyThreadView({ id }: { id: number }) {
  const [reply, setReply] = useState<Reply | null>(null);
  const [children, setChildren] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await getReplyDetail(id);
      setReply(data.reply);
      setChildren(data.replies);
    } catch {
      setError("Reply not found or the API is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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
        <ReplyCard reply={reply} threadLineBelow={children.length > 0} />
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
            />
          ))}
        </div>
      </div>
    </main>
  );
}
