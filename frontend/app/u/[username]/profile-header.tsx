"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";

export default function ProfileHeader({ username }: { username: string }) {
  // Своя страница (открыта из sidenav) — без кнопки back.
  // Чужой профиль (открыт из темы и т.п.) — кнопка back показывается.
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    setShowBack(localStorage.getItem("mindset_username") !== username);
  }, [username]);

  return <PageHeader title={username} showBack={showBack} />;
}
