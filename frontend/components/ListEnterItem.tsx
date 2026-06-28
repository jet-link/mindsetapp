"use client";

import type { ReactNode } from "react";

/** Сколько первых карточек получают каскадную задержку. */
export const LIST_ENTER_STAGGER_MAX = 14;
const STAGGER_STEP_MS = 42;
const STAGGER_CAP_MS = 380;

/**
 * Обёртка для каскадного появления элемента списка при смене вкладки.
 * Не используется при догрузке infinite scroll — только когда animate=true.
 */
export default function ListEnterItem({
  index,
  animate,
  children,
  className = "",
}: {
  index: number;
  animate: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!animate || index >= LIST_ENTER_STAGGER_MAX) {
    return className ? <div className={className}>{children}</div> : <>{children}</>;
  }

  return (
    <div
      className={`list-enter${className ? ` ${className}` : ""}`}
      style={{
        animationDelay: `${Math.min(index * STAGGER_STEP_MS, STAGGER_CAP_MS)}ms`,
      }}
    >
      {children}
    </div>
  );
}
