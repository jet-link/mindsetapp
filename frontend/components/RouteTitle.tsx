"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SUFFIX = "Mindset";

export const HOME_PAGE_TITLE = `Main wall | ${SUFFIX}`;

// Текущий желаемый title страницы. Next.js при повторной навигации на тот же
// маршрут сбрасывает document.title на дефолт — поэтому держим его здесь и
// переустанавливаем после клика.
let currentTitle = SUFFIX;

function composeTitle(title: string): string {
  return title ? `${title} | ${SUFFIX}` : SUFFIX;
}

export function applyCurrentTitle() {
  if (typeof document !== "undefined") document.title = currentTitle;
}

/** Переустанавливает текущий title несколько раз — переживает сброс Next.js. */
export function scheduleApplyCurrentTitle() {
  applyCurrentTitle();
  if (typeof window === "undefined") return;
  requestAnimationFrame(() => {
    applyCurrentTitle();
    requestAnimationFrame(applyCurrentTitle);
  });
  window.setTimeout(applyCurrentTitle, 0);
}

/** Задаёт title страницы (без суффикса « | Mindset»). */
export function setPageTitle(title: string) {
  currentTitle = composeTitle(title);
  scheduleApplyCurrentTitle();
}

/** Удобный шорткат для главной (лого / пункт «Main wall»). */
export function scheduleHomePageTitle() {
  setPageTitle("Main wall");
}

export default function RouteTitle() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;
    scheduleHomePageTitle();
  }, [pathname]);

  return null;
}


