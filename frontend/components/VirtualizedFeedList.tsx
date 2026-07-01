"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type Key = string | number;

/**
 * Оконная виртуализация ленты (windowing) под скролл всего окна, без сторонних
 * зависимостей. Полный список постов остаётся в памяти (источник правды —
 * массив `items` из кэша), а в DOM держим только окно элементов вокруг вьюпорта
 * плюс небольшой overscan. При прокрутке вверх старые карточки заново рендерятся
 * из того же массива — «восстановление из локального кэша».
 *
 * Высоты карточек измеряются после рендера и кэшируются по ключу, чтобы спейсеры
 * сверху/снизу держали корректную общую высоту скролла (скроллбар не «прыгает»).
 *
 * Пока элементов немного (<= threshold) — рендерим всё как обычно, чтобы не
 * платить за виртуализацию там, где она не нужна.
 */
export default function VirtualizedFeedList<T>({
  items,
  getKey,
  renderItem,
  className,
  estimateHeight = 420,
  overscanPx = 1200,
  threshold = 80,
  initialCount = 20,
  forceKey = null,
  forceKeys,
}: {
  items: T[];
  getKey: (item: T) => Key;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  /** Оценка высоты ещё не измеренной карточки (px). */
  estimateHeight?: number;
  /** Запас сверху/снизу вьюпорта, в пределах которого карточки остаются в DOM. */
  overscanPx?: number;
  /** Ниже этого числа элементов виртуализация выключена (рендерим всё). */
  threshold?: number;
  /** Сколько карточек рендерим на первом кадре до пересчёта по скроллу. */
  initialCount?: number;
  /** Ключ карточки, которую нужно гарантированно держать в DOM (для возврата к якорю). */
  forceKey?: Key | null;
  /** Дополнительные ключи, которые нужно держать в DOM (например, во время exit-анимации). */
  forceKeys?: ReadonlySet<Key>;
}) {
  const active = items.length > threshold;

  const containerRef = useRef<HTMLDivElement>(null);
  const heightsRef = useRef<Map<Key, number>>(new Map());
  const rowElsRef = useRef<Map<Key, HTMLElement>>(new Map());
  // Какой forceKey уже «потреблён» (карточка доехала в обычное окно — возврат к
  // якорю состоялся), чтобы устаревший forceKey не держал окно расширенным.
  const forceConsumedRef = useRef<Key | null>(null);

  const [range, setRange] = useState<{ start: number; end: number }>(() => ({
    start: 0,
    end: Math.min(items.length, initialCount),
  }));

  const getHeight = useCallback(
    (key: Key) => heightsRef.current.get(key) ?? estimateHeight,
    [estimateHeight],
  );

  const recompute = useCallback(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;

    const containerTop = el.getBoundingClientRect().top + window.scrollY;
    const viewTop = window.scrollY - containerTop - overscanPx;
    const viewBottom =
      window.scrollY - containerTop + window.innerHeight + overscanPx;

    let offset = 0;
    let start = 0;
    let end = items.length;
    let foundStart = false;

    for (let i = 0; i < items.length; i++) {
      const h = getHeight(getKey(items[i]));
      const top = offset;
      const bottom = offset + h;
      if (!foundStart && bottom >= viewTop) {
        start = i;
        foundStart = true;
      }
      if (top > viewBottom) {
        end = i;
        break;
      }
      offset += h;
    }
    if (!foundStart) start = Math.max(0, items.length - 1);

    // Держим карточку-якорь в DOM, пока возврат к ней не состоится. Как только
    // обычное окно её накрыло (restore доскроллил) — перестаём форсить.
    if (forceKey != null && forceConsumedRef.current !== forceKey) {
      const idx = items.findIndex((it) => getKey(it) === forceKey);
      if (idx !== -1) {
        if (idx >= start && idx < end) {
          forceConsumedRef.current = forceKey;
        } else {
          start = Math.min(start, idx);
          end = Math.max(end, idx + 1);
        }
      }
    }

    if (forceKeys?.size) {
      for (let i = 0; i < items.length; i++) {
        const key = getKey(items[i]);
        if (forceKeys.has(key)) {
          start = Math.min(start, i);
          end = Math.max(end, i + 1);
        }
      }
    }

    setRange((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );
  }, [active, items, getKey, getHeight, overscanPx, forceKey, forceKeys]);

  // Измеряем фактические высоты отрендеренных карточек и пересчитываем окно,
  // если что-то изменилось (поздняя подгрузка картинок/аватара меняет высоту).
  useLayoutEffect(() => {
    if (!active) return;
    let changed = false;
    for (const [key, node] of rowElsRef.current) {
      const h = node.offsetHeight;
      if (h && heightsRef.current.get(key) !== h) {
        heightsRef.current.set(key, h);
        changed = true;
      }
    }
    if (changed) recompute();
  });

  useEffect(() => {
    if (!active) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        recompute();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    recompute();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [active, recompute]);

  if (!active) {
    return (
      <div ref={containerRef} className={className}>
        {items.map((item, index) => (
          <div key={getKey(item)}>{renderItem(item, index)}</div>
        ))}
      </div>
    );
  }

  const start = Math.max(0, Math.min(range.start, items.length));
  const end = Math.max(start, Math.min(range.end, items.length));

  let topPad = 0;
  for (let i = 0; i < start; i++) topPad += getHeight(getKey(items[i]));
  let bottomPad = 0;
  for (let i = end; i < items.length; i++) bottomPad += getHeight(getKey(items[i]));

  const windowItems = items.slice(start, end);

  return (
    <div ref={containerRef} className={className}>
      <div style={{ height: topPad }} aria-hidden="true" />
      {windowItems.map((item, i) => {
        const key = getKey(item);
        const index = start + i;
        return (
          <div
            key={key}
            ref={(node) => {
              if (node) rowElsRef.current.set(key, node);
              else rowElsRef.current.delete(key);
            }}
          >
            {renderItem(item, index)}
          </div>
        );
      })}
      <div style={{ height: bottomPad }} aria-hidden="true" />
    </div>
  );
}
