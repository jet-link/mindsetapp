"use client";

import { useEffect, useRef, useState } from "react";
import BioText, { bioCharCount } from "@/components/BioText";
import Avatar from "@/components/Avatar";
import ProfileStats from "./profile-stats";
import {
  deleteMeAvatar,
  emitUserProfileUpdated,
  getStoredUsername,
  updateMeAvatar,
  updateMeBio,
} from "@/lib/api";

const BIO_LIMIT = 150;

export default function ProfileHead({
  username,
  initialBio,
  initialAvatar,
  followers,
  following,
}: {
  username: string;
  initialBio: string;
  initialAvatar: string | null;
  followers: number;
  following: number;
}) {
  const [isOwn, setIsOwn] = useState(false);
  const [bio, setBio] = useState(initialBio);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [bioOpen, setBioOpen] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [bioError, setBioError] = useState("");
  const [bioBusy, setBioBusy] = useState(false);
  const [avatarViewOpen, setAvatarViewOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsOwn(getStoredUsername() === username);
  }, [username]);

  useEffect(() => {
    setBio(initialBio);
    setAvatarUrl(initialAvatar);
  }, [initialBio, initialAvatar, username]);

  useEffect(() => {
    if (!bioOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [bioOpen]);

  useEffect(() => {
    if (!avatarViewOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [avatarViewOpen]);

  function openBioModal() {
    setBioDraft(bio);
    setBioError("");
    setBioOpen(true);
  }

  function closeBioModal() {
    setBioOpen(false);
    setBioError("");
  }

  async function saveBio(e?: React.FormEvent) {
    e?.preventDefault();
    if (bioCharCount(bioDraft) > BIO_LIMIT) {
      setBioError(`Bio must be ${BIO_LIMIT} characters or fewer.`);
      return;
    }
    setBioBusy(true);
    setBioError("");
    try {
      const me = await updateMeBio(bioDraft);
      setBio(me.bio);
      emitUserProfileUpdated({ username, bio: me.bio });
      closeBioModal();
    } catch (err) {
      setBioError(err instanceof Error ? err.message : "Failed to save bio");
    } finally {
      setBioBusy(false);
    }
  }

  function onAvatarClick() {
    if (avatarUrl) {
      setAvatarViewOpen(true);
      return;
    }
    if (isOwn) fileRef.current?.click();
  }

  async function onAvatarFileSelected(file: File | null) {
    if (!file || !isOwn) return;
    if (!file.type.startsWith("image/")) return;
    setAvatarBusy(true);
    try {
      const me = await updateMeAvatar(file);
      setAvatarUrl(me.avatar);
      emitUserProfileUpdated({ username, avatar: me.avatar });
    } catch {
      // ignore
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDeleteAvatar() {
    if (!isOwn || !avatarUrl || avatarBusy) return;
    setAvatarBusy(true);
    try {
      await deleteMeAvatar();
      setAvatarUrl(null);
      setAvatarViewOpen(false);
      emitUserProfileUpdated({ username, avatar: null });
    } catch {
      // ignore
    } finally {
      setAvatarBusy(false);
    }
  }

  function onChangeAvatar() {
    if (!isOwn || avatarBusy) return;
    fileRef.current?.click();
  }

  const canInteract = avatarUrl || isOwn;
  const bioTitle = bio ? "Edit bio" : "Add bio";
  const bioOverLimit = bioCharCount(bioDraft) > BIO_LIMIT;

  return (
    <>
      <div className="profile-head">
        <div className="profile-head__row">
          <div className="profile-head__identity">
            <h1 className="profile-head__name">{username}</h1>
            <p className="profile-handle">@{username}</p>
          </div>
          <div
            className={`profile-avatar-wrap${canInteract ? " profile-avatar-wrap--interactive" : ""}${
              isOwn && !avatarUrl ? " profile-avatar-wrap--editable" : ""
            }`}
            onClick={canInteract ? onAvatarClick : undefined}
            onKeyDown={
              canInteract
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") onAvatarClick();
                  }
                : undefined
            }
            role={canInteract ? "button" : undefined}
            tabIndex={canInteract ? 0 : undefined}
            aria-label={
              avatarUrl
                ? `View ${username}'s profile photo`
                : isOwn
                  ? "Add profile photo"
                  : undefined
            }
          >
            <Avatar username={username} src={avatarUrl} large />
          </div>
        </div>

        <div className="profile-head__details">
          {bio ? (
            <>
              <BioText text={bio} />
              {isOwn && (
                <button type="button" className="profile-edit-btn" onClick={openBioModal}>
                  Edit bio
                </button>
              )}
            </>
          ) : (
            isOwn && (
              <button type="button" className="profile-edit-btn" onClick={openBioModal}>
                Add bio
              </button>
            )
          )}
          <ProfileStats username={username} followers={followers} following={following} />
        </div>

        {isOwn && (
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => onAvatarFileSelected(e.target.files?.[0] ?? null)}
          />
        )}
      </div>

      {bioOpen && (
        <div
          className="surface-form-lightbox"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeBioModal();
          }}
        >
          <button
            type="button"
            className="close-btn surface-form-lightbox__close"
            onClick={closeBioModal}
            aria-label="Close"
          >
            <i className="fa fa-times" aria-hidden="true" />
          </button>
          <div
            className="surface-form-lightbox__stage"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeBioModal();
            }}
          >
            <h2 className="surface-form-lightbox__title">{bioTitle}</h2>
            <form className="surface-form-card" onSubmit={saveBio} noValidate>
              <label className="sr-only" htmlFor="profile-bio-draft">
                Bio
              </label>
              <textarea
                id="profile-bio-draft"
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                placeholder="Tell people about yourself…"
                aria-label="Bio"
                rows={6}
              />
              {bioError && (
                <p className="error surface-form-card__error" role="alert">
                  {bioError}
                </p>
              )}
              <div className="surface-form-card__footer">
                <button type="submit" className="btn" disabled={bioBusy || bioOverLimit}>
                  {bio ? "Edit" : "Add"}
                </button>
                <span
                  className={
                    bioOverLimit ? "bio-counter bio-counter--over" : "bio-counter"
                  }
                >
                  {bioCharCount(bioDraft)}/{BIO_LIMIT}
                </span>
              </div>
            </form>
          </div>
        </div>
      )}

      {avatarViewOpen && avatarUrl && (
        <div
          className="avatar-lightbox"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAvatarViewOpen(false);
          }}
        >
          <button
            type="button"
            className="close-btn avatar-lightbox__close"
            onClick={() => setAvatarViewOpen(false)}
            aria-label="Close"
          >
            <i className="fa fa-times" aria-hidden="true" />
          </button>
          <div
            className="avatar-lightbox__stage"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setAvatarViewOpen(false);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="avatar-lightbox__img"
              src={avatarUrl}
              alt={`${username}'s profile photo`}
            />
            {isOwn && (
              <div className="avatar-lightbox__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--wide"
                  onClick={onChangeAvatar}
                  disabled={avatarBusy}
                >
                  Change
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--wide"
                  onClick={onDeleteAvatar}
                  disabled={avatarBusy}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
