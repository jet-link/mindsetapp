"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import ReplyCard from "@/components/ReplyCard";
import ThemeCard from "@/components/ThemeCard";
import ThreadRepliesLabel from "@/components/ThreadRepliesLabel";
import ReplyForm from "./reply-form";
import { Reply, Theme, USER_PROFILE_EVENT, UserProfileUpdatedDetail, getReplyDetail, getThread } from "@/lib/api";
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
  const [theme, setTheme] = useState<Theme | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      }
    } catch {
      setError("Thread not found or the API is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [id, focusReplyId]);

  useEffect(() => {
    load();
  }, [load]);

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
            />
          ))}
        </div>
      </div>
    </main>
  );
}
