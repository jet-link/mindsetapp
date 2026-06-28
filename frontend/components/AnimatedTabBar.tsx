"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type TabDef<T extends string> = {
  id: T;
  label: ReactNode;
  disabled?: boolean;
};

/**
 * Полоска вкладок со скользящим индикатором (как в Threads/Instagram).
 * Совместима с существующими стилями `.tabs`.
 */
export default function AnimatedTabBar<T extends string>({
  tabs,
  activeId,
  onSelect,
  ariaLabel,
  className = "",
}: {
  tabs: TabDef<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [ready, setReady] = useState(false);

  const updateIndicator = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    const active = bar.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!active) return;
    const barRect = bar.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    setIndicator({ left: rect.left - barRect.left, width: rect.width });
    setReady(true);
  }, []);

  useLayoutEffect(() => {
    updateIndicator();
  }, [activeId, tabs, updateIndicator]);

  useEffect(() => {
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  return (
    <div
      ref={barRef}
      className={`tabs tabs--animated${className ? ` ${className}` : ""}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      <div
        className={`tabs__indicator${ready ? " tabs__indicator--ready" : ""}`}
        aria-hidden="true"
        style={{
          transform: `translateX(${indicator.left}px)`,
          width: indicator.width,
        }}
      />
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={activeId === t.id}
          className={activeId === t.id ? "active" : ""}
          disabled={t.disabled}
          onClick={(e) => {
            if (t.disabled) return;
            onSelect(t.id);
            e.currentTarget.blur();
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
