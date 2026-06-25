import { useEffect } from "react";

let lockCount = 0;
let saved: {
  htmlOverflow: string;
  bodyOverflow: string;
  bodyPaddingRight: string;
} | null = null;

/** Блокирует прокрутку страницы (html + body). Возвращает функцию разблокировки. */
export function lockPageScroll(): () => void {
  lockCount += 1;
  if (lockCount === 1) {
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    saved = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      bodyPaddingRight: document.body.style.paddingRight,
    };
    document.documentElement.classList.add("modal-open");
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }
  }
  return () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0 && saved) {
      document.documentElement.classList.remove("modal-open");
      document.documentElement.style.overflow = saved.htmlOverflow;
      document.body.style.overflow = saved.bodyOverflow;
      document.body.style.paddingRight = saved.bodyPaddingRight;
      saved = null;
    }
  };
}

export function usePageScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    return lockPageScroll();
  }, [locked]);
}
