"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ComposerTextarea from "@/components/ComposerTextarea";
import { createReply, emitReplyCreated, isLoggedIn } from "@/lib/api";
import { parseCooldownSeconds, useCooldown } from "@/lib/use-cooldown";
import {
  THEME_BODY_LIMIT,
  normalizeThemeBody,
  themeCharCount,
} from "@/lib/theme-body";

export default function ReplyForm({
  themeId,
  parentId,
  onPosted,
}: {
  themeId: number;
  parentId?: number;
  onPosted?: () => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const cooldown = useCooldown();

  const chars = themeCharCount(body);
  const overLimit = chars > THEME_BODY_LIMIT;

  useEffect(() => {
    setAuthed(isLoggedIn());
  }, []);

  if (authed === null) {
    return <div className="composer composer--placeholder" aria-hidden="true" />;
  }

  if (!authed) {
    return (
      <div className="composer composer--login">
        <Link href="/login" className="login-hint">
          Log in to reply
        </Link>
      </div>
    );
  }

  function handleBodyChange(value: string) {
    setBody(normalizeThemeBody(value));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeThemeBody(body);
    if (!normalized.trim() || themeCharCount(normalized) > THEME_BODY_LIMIT) return;
    setBusy(true);
    setError("");
    try {
      const reply = await createReply(themeId, normalized, parentId);
      setBody("");
      emitReplyCreated({
        themeId,
        parentId: parentId ?? null,
        reply,
        themeRepliesCount: reply.theme_replies_count,
        parentRepliesCount: reply.parent_replies_count,
      });
      onPosted?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to post the reply";
      const secs = parseCooldownSeconds(message);
      if (secs) {
        cooldown.start(secs);
        setError("");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="composer" onSubmit={submit} noValidate>
      <label className="sr-only" htmlFor="reply-body">
        Your reply
      </label>
      <ComposerTextarea
        id="reply-body"
        placeholder="Your reply… Use @ to mention someone"
        value={body}
        onChange={handleBodyChange}
        aria-label="Your reply"
      />
      <div className="composer-footer">
        <div className="composer-actions">
          <button className="btn" type="submit" disabled={busy || !body.trim() || overLimit || cooldown.active}>
            Reply
          </button>
          <button type="button" className="icon-btn" disabled title="Attach — coming soon" aria-label="Attach file">
            <i className="fa fa-paperclip" aria-hidden="true" />
          </button>
        </div>
        <div className="composer-meta">
          {cooldown.active ? (
            <span className="bio-counter">You can reply again in {cooldown.seconds}s</span>
          ) : (
            <span className={overLimit ? "bio-counter bio-counter--over" : "bio-counter"}>
              {chars}/{THEME_BODY_LIMIT}
            </span>
          )}
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
