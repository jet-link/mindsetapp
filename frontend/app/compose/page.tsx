"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Composer from "@/components/Composer";
import ThemeCard from "@/components/ThemeCard";
import { Theme, USER_PROFILE_EVENT, UserProfileUpdatedDetail, getStoredUsername, getUserThemes, isLoggedIn } from "@/lib/api";
import { patchThemeAuthors } from "@/lib/user-avatar-store";

const RECENT_THEMES_LIMIT = 10;

export default function ComposePage() {
  const router = useRouter();
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
      <PageHeader title="New theme" showBack={false} />
      <Composer onPosted={onPosted} />

      {loaded && recent.length === 0 && (
        <p className="section-title muted">You haven&apos;t published any theme yet</p>
      )}

      {recent.length > 0 && (
        <>
          <h2 className="section-title">Your last themes</h2>
          {recent.map((t) => (
            <ThemeCard key={t.id} theme={t} />
          ))}
        </>
      )}
    </main>
  );
}
