"use client";

import { useEffect, useState } from "react";
import { USER_PROFILE_EVENT, UserProfileUpdatedDetail } from "@/lib/api";
import { resolveUserAvatar } from "@/lib/user-avatar-store";

export default function Avatar({
  username,
  src: initialSrc,
  large = false,
}: {
  username: string;
  src?: string | null;
  large?: boolean;
}) {
  const [src, setSrc] = useState(() => resolveUserAvatar(username, initialSrc));

  useEffect(() => {
    setSrc(resolveUserAvatar(username, initialSrc));
  }, [initialSrc, username]);

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<UserProfileUpdatedDetail>).detail;
      if (detail.username === username && detail.avatar !== undefined) {
        setSrc(detail.avatar);
      }
    };
    window.addEventListener(USER_PROFILE_EVENT, onUpdate);
    return () => window.removeEventListener(USER_PROFILE_EVENT, onUpdate);
  }, [username]);

  const cls = large ? "avatar avatar--lg" : "avatar";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        className={cls}
        src={src}
        alt={username}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return <span className={cls}>{username[0]?.toUpperCase()}</span>;
}
