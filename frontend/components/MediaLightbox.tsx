"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { MediaItem } from "@/lib/api";
import { isGifMedia } from "@/lib/media-types";

function ArrowIcon({ dir }: { dir: "prev" | "next" }) {
  // Простая линейная стрелка (как в макете), без font-awesome.
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {dir === "next" ? (
        <>
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="13 6 19 12 13 18" />
        </>
      ) : (
        <>
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="11 6 5 12 11 18" />
        </>
      )}
    </svg>
  );
}

export default function MediaLightbox({
  media,
  startIndex,
  onClose,
}: {
  media: MediaItem[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTs = useRef(0);
  const rafId = useRef<number | null>(null);

  const last = media.length - 1;
  const hasNav = media.length > 1;

  // Блокируем скролл фона, пока открыт просмотрщик.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Стартовая позиция — без анимации, сразу на нужном кадре.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = startIndex * el.clientWidth;
  }, [startIndex]);

  const scrollToIndex = useCallback((i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }, []);

  const go = useCallback(
    (delta: number) => {
      scrollToIndex(Math.max(0, Math.min(last, index + delta)));
    },
    [index, last, scrollToIndex],
  );

  // Текущий кадр считаем из нативного скролла (плавно, как в ленте).
  const onScroll = useCallback(() => {
    lastScrollTs.current = Date.now();
    if (rafId.current != null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      const el = scrollRef.current;
      if (!el) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setIndex((cur) => (cur !== i ? i : cur));
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && hasNav) go(1);
      else if (e.key === "ArrowLeft" && hasNav) go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, hasNav, onClose]);

  function onBackdropClick(e: ReactMouseEvent) {
    // Не закрываем сразу после свайпа/скролла.
    if (Date.now() - lastScrollTs.current < 120) return;
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    // Клик по самому изображению не закрывает; по тёмной области — закрывает.
    if (target.tagName === "IMG") return;
    onClose();
  }

  return (
    <div className="media-lightbox" onClick={onBackdropClick}>
      <button
        type="button"
        className="close-btn media-lightbox__close"
        onClick={onClose}
        aria-label="Close"
      >
        <i className="fa fa-times" aria-hidden="true" />
      </button>

      {hasNav && index > 0 && (
        <button
          type="button"
          className="media-lightbox__nav media-lightbox__nav--prev"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          aria-label="Previous"
        >
          <ArrowIcon dir="prev" />
        </button>
      )}

      <div
        className="media-lightbox__viewport"
        ref={scrollRef}
        onScroll={onScroll}
      >
        {media.map((m) => {
          const animated = isGifMedia(m);
          return (
          <div className="media-lightbox__slide" key={m.key ?? m.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="media-lightbox__img"
              src={animated ? m.url : (m.url || m.medium_url)}
              srcSet={animated ? undefined : (m.srcset || undefined)}
              sizes="100vw"
              alt=""
              draggable={false}
            />
          </div>
          );
        })}
      </div>

      {hasNav && index < last && (
        <button
          type="button"
          className="media-lightbox__nav media-lightbox__nav--next"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          aria-label="Next"
        >
          <ArrowIcon dir="next" />
        </button>
      )}
    </div>
  );
}
