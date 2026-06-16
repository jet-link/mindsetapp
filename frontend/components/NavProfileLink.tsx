"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import {
  AUTH_EVENT,
  USER_PROFILE_EVENT,
  UserProfileUpdatedDetail,
  getMe,
  isLoggedIn,
} from "@/lib/api";

type NavProfileLinkProps = {
  username: string | null;
  href: string;
  active: boolean;
  className: string;
  onPointerDown?: (e: React.PointerEvent<HTMLAnchorElement>) => void;
};

export default function NavProfileLink({
  username,
  href,
  active,
  className,
  onPointerDown,
}: NavProfileLinkProps) {
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!username || !isLoggedIn()) {
      setAvatar(null);
      return;
    }
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) setAvatar(me.avatar);
      })
      .catch(() => {
        if (!cancelled) setAvatar(null);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    const onAuth = () => {
      if (!username || !isLoggedIn()) {
        setAvatar(null);
        return;
      }
      getMe()
        .then((me) => setAvatar(me.avatar))
        .catch(() => setAvatar(null));
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [username]);

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const { username: changed, avatar: nextAvatar } = (
        e as CustomEvent<UserProfileUpdatedDetail>
      ).detail;
      if (username && changed === username && nextAvatar !== undefined) {
        setAvatar(nextAvatar);
      }
    };
    window.addEventListener(USER_PROFILE_EVENT, onUpdate);
    return () => window.removeEventListener(USER_PROFILE_EVENT, onUpdate);
  }, [username]);

  return (
    <Link
      href={href}
      prefetch={false}
      className={`${className}${active ? " active" : ""}`}
      title="Profile"
      aria-label="Profile"
      aria-current={active ? "page" : undefined}
      onPointerDown={onPointerDown}
    >
      {username ? (
        <span className="nav-profile-avatar">
          <Avatar username={username} src={avatar} />
        </span>
      ) : (
        <i className="fa fa-user-o" aria-hidden="true" />
      )}
    </Link>
  );
}
