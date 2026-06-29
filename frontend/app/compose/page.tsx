"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/PageHeader";
import Composer from "@/components/Composer";
import ThemeCard from "@/components/ThemeCard";
import { Theme, USER_PROFILE_EVENT, UserProfileUpdatedDetail, getStoredUsername, getUserThemes, isLoggedIn } from "@/lib/api";
import { patchThemeAuthors } from "@/lib/user-avatar-store";

const RECENT_THEMES_LIMIT = 10;

export default function ComposePage() {
  const router = useRouter();
  const { t } = useTranslation("feed");
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [recent, setRecent] = useState<Theme[]>([]);

  useEffect(() => {
    // Гостя сразу отправляем на логин
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    setReady(true);
    const username = getStoredUsername();
    if (username) {
      getUserThemes(username)
        .then((p) => setRecent(p.results.slice(0, RECENT_THEMES_LIMIT)))
        .catch(() => {})
        .finally(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  }, [router]);

  useEffect(() => {
    const onProfileUpdated = (e: Event) => {
      const { username, avatar } = (e as CustomEvent<UserProfileUpdatedDetail>).detail;
      if (avatar === undefined) return;
      setRecent((prev) => patchThemeAuthors(prev, username, avatar));
    };
    window.addEventListener(USER_PROFILE_EVENT, onProfileUpdated);
    return () => window.removeEventListener(USER_PROFILE_EVENT, onProfileUpdated);
  }, []);

  if (!ready) return null;

  // Мгновенно добавляем только что опубликованную тему в начало списка
  function onPosted(theme?: Theme) {
    if (theme) setRecent((prev) => [theme, ...prev].slice(0, RECENT_THEMES_LIMIT));
  }

  return (
    <main>
      <PageHeader title={t("newThemeLabel")} showBack={false} />
      <Composer onPosted={onPosted} />

      {loaded && recent.length === 0 && (
        <p className="section-title muted">{t("noThemesPublished")}</p>
      )}

      {recent.length > 0 && (
        <>
          <h2 className="section-title">{t("yourLastThemes")}</h2>
          {recent.map((theme) => (
            <ThemeCard key={theme.id} theme={theme} />
          ))}
        </>
      )}
    </main>
  );
}
