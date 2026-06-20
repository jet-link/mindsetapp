"use client";

import { useEffect } from "react";

/**
 * В репозитории нет своего service worker. На localhost иногда остаётся
 * регистрация от старого PWA/расширения — Chrome тогда сыпет предупреждение
 * про navigation preload при Fast Refresh.
 */
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister();
      });
    });
  }, []);

  return null;
}
