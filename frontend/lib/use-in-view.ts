import { useEffect, useRef, useState } from "react";

/**
 * Отслеживает, находится ли элемент в зоне видимости (для автоплея видео при
 * прокрутке до карточки, как в threads.com). Возвращает ref и булев флаг.
 *
 * threshold — какая доля элемента должна быть видна, чтобы считать его «в кадре».
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  { threshold = 0.5, rootMargin = "0px" }: { threshold?: number; rootMargin?: string } = {},
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setInView(entry.isIntersecting);
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return [ref, inView];
}
