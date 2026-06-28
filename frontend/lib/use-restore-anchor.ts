import { useEffect, useLayoutEffect } from "react";
import {
  clearReturnAnchor,
  computeAnchorTop,
  peekReturnAnchorForList,
} from "@/lib/return-anchor";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Сколько кадров ждём появления элемента в DOM, прежде чем сдаться.
const MAX_NOT_FOUND_FRAMES = 16;
// Сколько удерживаем карточку на месте, докручивая при сдвигах layout
// (поздняя загрузка аватара/шапки/картинок). Прерывается действием пользователя.
const PIN_DURATION_MS = 1200;

interface Options {
  /** Если якоря для этого списка нет — прокрутить наверх (для детальных страниц). */
  scrollTopWhenNoAnchor?: boolean;
}

/**
 * После router.back() возвращает в список с карточкой на сохранённой позиции.
 * Выполняется в useLayoutEffect (до отрисовки) и затем кратко «пиннит» позицию,
 * пока layout не устаканится, — без мерцания и анимации скролла.
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
      if (scrollTopWhenNoAnchor) {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      }
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let notFound = 0;
    const start =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const now = () =>
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const stop = () => {
      if (cancelled) return;
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
      clearReturnAnchor(listKey);
    };

    const frame = () => {
      if (cancelled) return;

      const target = computeAnchorTop(anchor);
      if (target === null) {
        if (++notFound >= MAX_NOT_FOUND_FRAMES) {
          stop();
          return;
        }
        rafId = requestAnimationFrame(frame);
        return;
      }

      // Докручиваем только при реальном сдвиге, чтобы не мешать ничему лишним.
      if (Math.abs(window.scrollY - target) > 1) {
        window.scrollTo({ top: target, left: 0, behavior: "instant" as ScrollBehavior });
      }

      if (now() - start > PIN_DURATION_MS) {
        stop();
        return;
      }
      rafId = requestAnimationFrame(frame);
    };

    // Пользователь сам начал прокрутку/взаимодействие — сразу отпускаем позицию.
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("pointerdown", stop, { passive: true });
    window.addEventListener("keydown", stop);

    frame();

    return stop;
  }, [listKey, ready, scrollTopWhenNoAnchor]);
}
