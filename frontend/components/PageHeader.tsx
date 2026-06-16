"use client";

import { useEffect } from "react";
import BackButton from "./BackButton";

export default function PageHeader({
  title,
  showBack = true,
}: {
  title?: string;
  showBack?: boolean;
}) {
  useEffect(() => {
    if (title) document.title = `${title} | Mindset`;
  }, [title]);

  return (
    <div className="page-toolbar">
      {showBack && <BackButton />}
      {title && <span className="page-title">{title}</span>}
    </div>
  );
}
