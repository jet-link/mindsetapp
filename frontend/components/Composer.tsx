"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ComposerTextarea from "@/components/ComposerTextarea";
import { Theme, createTheme, emitThemeCreated, isLoggedIn } from "@/lib/api";
import { THEME_COOLDOWN_SECONDS } from "@/lib/cooldown-storage";
import { parseCooldownSeconds, useCooldown } from "@/lib/use-cooldown";
import {
  THEME_BODY_LIMIT,
  normalizeThemeBody,
  themeCharCount,
} from "@/lib/theme-body";

export default function Composer({ onPosted }: { onPosted?: (theme?: Theme) => void }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const cooldown = useCooldown("theme");

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
          Log in to post
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
      const theme = await createTheme(normalized);
      setBody("");
      cooldown.start(THEME_COOLDOWN_SECONDS);
      emitThemeCreated(theme);
      onPosted?.(theme);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to publish";
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
      <label className="sr-only" htmlFor="compose-body">
        New theme
      </label>
      <ComposerTextarea
        id="compose-body"
        placeholder="What's new? #hashtags, @mentions and links are supported"
        value={body}
        onChange={handleBodyChange}
        aria-label="New theme"
      />
      <div className="composer-footer">
        <div className="composer-actions">
          <button
            className="btn"
            type="submit"
            disabled={busy || !body.trim() || overLimit || cooldown.active}
          >
            Post
          </button>
          <button type="button" className="icon-btn" disabled title="Attach — coming soon" aria-label="Attach file">
            <i className="fa fa-paperclip" aria-hidden="true" />
          </button>
        </div>
        <div className="composer-meta">
          {cooldown.active ? (
            <span className="bio-counter">You can post again in {cooldown.seconds}s</span>
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
