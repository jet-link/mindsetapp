"use client";

import { useEffect, useRef, type AnimationEvent, type ReactNode } from "react";

export const LIST_EXIT_ANIM = "list-exit-up";
export const LIST_EXIT_ANIM_REDUCED = "list-exit-up-reduced";

export default function ListExitWrap({
  exiting,
  onExitComplete,
  className = "",
  children,
}: {
  exiting?: boolean;
  onExitComplete?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exiting || !ref.current) return;
    ref.current.style.setProperty("--exit-max", `${ref.current.scrollHeight}px`);
  }, [exiting]);

  function onAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    if (e.target !== ref.current) return;
    if (e.animationName !== LIST_EXIT_ANIM && e.animationName !== LIST_EXIT_ANIM_REDUCED) return;
    onExitComplete?.();
  }

  return (
    <div
      ref={ref}
      className={`list-exit${exiting ? " list-exit--active" : ""}${className ? ` ${className}` : ""}`}
      onAnimationEnd={exiting ? onAnimationEnd : undefined}
    >
      {children}
    </div>
  );
}
