"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ComposerTextarea from "@/components/ComposerTextarea";
import {
  MediaAttachButton,
  MediaPreviews,
  useMediaPicker,
} from "@/components/MediaPickerField";
import { CooldownError, Theme, createTheme, emitThemeCreated, isLoggedIn } from "@/lib/api";
import { THEME_COOLDOWN_SECONDS } from "@/lib/cooldown-storage";
import { useCooldown } from "@/lib/use-cooldown";
import { mediaLimitExceededMessage } from "@/lib/media-limit";
import {
  THEME_BODY_LIMIT,
  normalizeThemeBody,
  themeCharCount,
} from "@/lib/theme-body";

export default function Composer({ onPosted }: { onPosted?: (theme?: Theme) => void }) {
  const { t } = useTranslation("feed");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const cooldown = useCooldown("theme");
  const picker = useMediaPicker(10, "theme");

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
          {t("auth:loginToPost")}
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
    const hasMedia = picker.files.length > 0;
    if ((!normalized.trim() && !hasMedia) || themeCharCount(normalized) > THEME_BODY_LIMIT) return;
    if (picker.files.length > picker.max) {
      setError(mediaLimitExceededMessage("theme", picker.files.length, picker.max));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const theme = await createTheme(normalized, picker.files);
      setBody("");
      picker.clear();
      cooldown.start(THEME_COOLDOWN_SECONDS);
      emitThemeCreated(theme);
      onPosted?.(theme);
    } catch (err) {
      if (err instanceof CooldownError) {
        cooldown.start(err.retryAfter || THEME_COOLDOWN_SECONDS);
        setError("");
      } else {
        setError(err instanceof Error ? err.message : t("failedToPublish"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="composer" onSubmit={submit} noValidate>
      <label className="sr-only" htmlFor="compose-body">
        {t("newThemeLabel")}
      </label>
      <ComposerTextarea
        id="compose-body"
        placeholder={t("composerPlaceholder")}
        value={body}
        onChange={handleBodyChange}
        aria-label={t("newThemeLabel")}
      />
      <div className="composer-footer">
        <div className="composer-actions">
          <button
            className="btn"
            type="submit"
            disabled={busy || (!body.trim() && picker.files.length === 0) || overLimit || picker.overLimit || cooldown.active}
          >
            {busy ? (
              <span className="btn-spinner" aria-hidden="true" />
            ) : (
              t("post")
            )}
          </button>
          <MediaAttachButton picker={picker} disabled={busy} />
        </div>
        <div className="composer-meta">
          {cooldown.active ? (
            <span className="bio-counter">{t("canPostAgain", { seconds: cooldown.seconds })}</span>
          ) : (
            <span className={overLimit ? "bio-counter bio-counter--over" : "bio-counter"}>
              {chars}/{THEME_BODY_LIMIT}
            </span>
          )}
        </div>
      </div>
      <MediaPreviews picker={picker} />
      {busy && picker.files.length > 0 && (
        <div className="composer-uploading" role="status">
          <span className="btn-spinner btn-spinner--dark" aria-hidden="true" /> {t("publishingMedia")}
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
