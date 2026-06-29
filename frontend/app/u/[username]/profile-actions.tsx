"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { emitFollowChanged, getProfile, getStoredUsername, isLoggedIn, logout, toggleFollow, AUTH_EVENT } from "@/lib/api";

export default function ProfileActions({
  username,
  initialFollowing,
}: {
  username: string;
  initialFollowing: boolean;
}) {
  const { t } = useTranslation("profile");
  const [following, setFollowing] = useState(initialFollowing);
  const [isOwn, setIsOwn] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const own = getStoredUsername() === username;
    setIsOwn(own);
    setAuthed(isLoggedIn());
    const onAuth = () => setAuthed(isLoggedIn());
    window.addEventListener(AUTH_EVENT, onAuth);
    // SSR не знает наш JWT и всегда отдаёт is_following=false. Перепроверяем
    // реальное состояние подписки на клиенте, где токен доступен.
    // Кнопку показываем только после того, как узнали правду — без мерцания.
    if (!own && isLoggedIn()) {
      getProfile(username)
        .then((p) => setFollowing(p.is_following))
        .catch(() => {})
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [username]);

  // Пока не знаем чей профиль и реальное состояние подписки — кнопки не показываем
  if (isOwn === null || !ready) return <div className="profile-actions" />;

  async function onFollow() {
    // Оптимистично переключаем сразу, чтобы кнопка реагировала с первого клика.
    const optimistic = !following;
    setFollowing(optimistic);
    try {
      const r = await toggleFollow(username);
      setFollowing(r.following);
      const viewer = getStoredUsername() ?? undefined;
      emitFollowChanged({
        profileUsername: username,
        following: r.following,
        followers_count: r.followers_count,
        viewerUsername: viewer,
        viewer_following_count: r.following_count,
      });
    } catch {
      setFollowing(!optimistic);
      window.location.href = "/login";
    }
  }

  async function onMention() {
    await navigator.clipboard.writeText(`@${username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function onLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="profile-actions">
      {!isOwn && authed && (
        <button className={`btn btn--wide ${following ? "btn--ghost" : ""}`} onClick={onFollow}>
          {following ? t("followingState") : t("follow")}
        </button>
      )}
      <button className="btn btn--ghost btn--wide" onClick={onMention}>
        {copied ? t("copied") : t("mention")}
      </button>
      {isOwn && (
        <button className="btn btn--ghost btn--wide" onClick={onLogout}>
          {t("logout")}
        </button>
      )}
    </div>
  );
}
