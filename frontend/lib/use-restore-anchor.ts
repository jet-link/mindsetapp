import { useEffect, useLayoutEffect } from "react";
import {
  clearReturnAnchor,
  peekReturnAnchorForList,
  scrollToAnchor,
  type ReturnAnchor,
} from "@/lib/return-anchor";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const MAX_ATTEMPTS = 16;

interface Options {
  /** Если якоря для этого списка нет — прокрутить наверх (для детальных страниц). */
  scrollTopWhenNoAnchor?: boolean;
}

/**
 * После router.back() возвращает в список с карточкой по центру экрана.
 * Вызывается в useLayoutEffect до отрисовки — без мерцания и анимации скролла.
 */
export function useRestoreAnchor(listKey: string, ready: boolean, options: Options = {}) {
  const { scrollTopWhenNoAnchor = false } = options;

  useEffect(() => {
    if (typeof history !== "undefined" && "scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
  }, []);

  useIsoLayoutEffect(() => {
    if (!ready) return;

    const anchor = peekReturnAnchorForList(listKey);
    if (!anchor) {
      if (scrollTopWhenNoAnchor) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return;
    }

    let attempts = 0;

    const finish = (a: ReturnAnchor) => {
      clearReturnAnchor(listKey);
      requestAnimationFrame(() => {
        scrollToAnchor(a);
        requestAnimationFrame(() => scrollToAnchor(a));
      });
    };

    const tryRestore = () => {
      const current = peekReturnAnchorForList(listKey);
      if (!current) return;

      if (scrollToAnchor(current)) {
        finish(current);
        return;
      }

      attempts += 1;
      if (attempts < MAX_ATTEMPTS) {
        requestAnimationFrame(tryRestore);
      }
    };

    tryRestore();
  }, [listKey, ready, scrollTopWhenNoAnchor]);
}
