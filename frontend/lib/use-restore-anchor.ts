import { useEffect, useLayoutEffect } from "react";
import {
  clearReturnAnchor,
  computeAnchorTop,
  peekReturnAnchorForList,
} from "@/lib/return-anchor";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Сколько ждём появления элемента в DOM (async-загрузка списка), прежде чем сдаться.
const NOT_FOUND_TIMEOUT_MS = 2500;
// Абсолютный максимум удержания карточки на месте (страховка от вечного цикла).
const PIN_HARD_CAP_MS = 6000;
// Сколько layout должен «молчать» (без сдвигов), чтобы отпустить позицию.
// Пока над карточкой догружаются картинки/эмбеды в длинном треде — список
// растёт, цель смещается, и мы продолжаем докручивать; как только рост
// прекратился на QUIET_MS — считаем позицию восстановленной.
const PIN_QUIET_MS = 340;

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
    const now = () =>
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const start = now();
    // Последний момент, когда пришлось докрутить (layout ещё «дышит»).
    let lastAdjust = start;

    const stop = (reason: string) => {
      if (cancelled) return;
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("wheel", onUser);
      window.removeEventListener("touchstart", onUser);
      window.removeEventListener("pointerdown", onUser);
      window.removeEventListener("keydown", onUser);
      // Якорь снимаем только когда восстановление реально завершилось (settled/
      // hardcap/действие пользователя). На "cleanup" (размонтирование или
      // повторный прогон эффекта в StrictMode) НЕ трогаем: иначе повторный
      // прогон не найдёт якорь и уедет наверх (scrollTopWhenNoAnchor).
      if (reason !== "cleanup") clearReturnAnchor(listKey);
    };

    const onUser = () => stop("user-interaction");

    const frame = () => {
      if (cancelled) return;

      const target = computeAnchorTop(anchor);
      if (target === null) {
        // Элемента ещё нет в DOM (список догружается) — ждём его появления.
        if (now() - start > NOT_FOUND_TIMEOUT_MS) {
          stop("notfound-timeout");
          return;
        }
        rafId = requestAnimationFrame(frame);
        return;
      }

      // Докручиваем только при реальном сдвиге. Каждый сдвиг — признак того, что
      // над карточкой ещё меняется layout (догрузка картинок/эмбедов в длинном
      // треде), поэтому продлеваем удержание, пока рост не прекратится.
      if (Math.abs(window.scrollY - target) > 1) {
        window.scrollTo({ top: target, left: 0, behavior: "instant" as ScrollBehavior });
        lastAdjust = now();
      }

      const settled = now() - lastAdjust > PIN_QUIET_MS;
      if (settled || now() - start > PIN_HARD_CAP_MS) {
        stop(settled ? "settled" : "hardcap");
        return;
      }
      rafId = requestAnimationFrame(frame);
    };

    // Пользователь сам начал прокрутку/взаимодействие — сразу отпускаем позицию.
    window.addEventListener("wheel", onUser, { passive: true });
    window.addEventListener("touchstart", onUser, { passive: true });
    window.addEventListener("pointerdown", onUser, { passive: true });
    window.addEventListener("keydown", onUser);

    frame();

    return () => stop("cleanup");
  }, [listKey, ready, scrollTopWhenNoAnchor]);
}
