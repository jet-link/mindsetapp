import { useCallback, useEffect, useRef } from "react";

/**
 * Бесконечный скролл в стиле threads.com: вешаем возвращённый ref на элемент-
 * «сторож» в конце ленты. Когда он попадает в зону видимости (с запасом
 * rootMargin — заранее, за ~несколько постов до конца), вызываем onLoadMore.
 *
 * Пока идёт загрузка, observer отключается, чтобы не слать дублирующие запросы;
 * после загрузки переподключается и при необходимости тянет следующую порцию.
 */
export function useInfiniteScroll({
  hasMore,
  loading,
  onLoadMore,
  rootMargin = "800px",
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  rootMargin?: string;
}) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (!node || !hasMore || loading) return;
      if (typeof IntersectionObserver === "undefined") return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) onLoadMoreRef.current();
        },
        { rootMargin },
      );
      observerRef.current.observe(node);
    },
    [hasMore, loading, rootMargin],
  );

  useEffect(() => {
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, []);

  return sentinelRef;
}
