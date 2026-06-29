"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FOLLOW_EVENT, FollowChangedDetail, getProfile, getStoredUsername } from "@/lib/api";
import { formatCompactNumber } from "@/lib/i18n";

export default function ProfileStats({
  username,
  followers,
  following,
}: {
  username: string;
  followers: number;
  following: number;
}) {
  const { t } = useTranslation("profile");
  const [followersCount, setFollowersCount] = useState(followers);
  const [followingCount, setFollowingCount] = useState(following);

  useEffect(() => {
    async function refresh() {
      try {
        const p = await getProfile(username);
        setFollowersCount(p.followers_count);
        setFollowingCount(p.following_count);
      } catch {
        // профиль недоступен — оставляем SSR-значения
      }
    }
    refresh();

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [username]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<FollowChangedDetail>).detail;
      if (!detail) return;
      if (detail.profileUsername === username && detail.followers_count !== undefined) {
        setFollowersCount(detail.followers_count);
      }
      const me = getStoredUsername();
      if (
        me === username &&
        detail.viewerUsername === me &&
        detail.viewer_following_count !== undefined
      ) {
        setFollowingCount(detail.viewer_following_count);
      }
    };
    window.addEventListener(FOLLOW_EVENT, handler);
    return () => window.removeEventListener(FOLLOW_EVENT, handler);
  }, [username]);

  return (
    <div className="stats">
      <Link href={`/u/${username}/followers`} className="stat-link">
        {formatCompactNumber(followersCount)} {t("followers", { count: followersCount })}
      </Link>
      <span className="stat-sep"> · </span>
      <Link href={`/u/${username}/following`} className="stat-link">
        {formatCompactNumber(followingCount)} {t("following")}
      </Link>
    </div>
  );
}
