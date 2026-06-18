"use client";

import { useEffect } from "react";
import { setMobileBackVisible } from "@/lib/mobile-back";
import { setPageTitle } from "@/components/RouteTitle";
import BackButton from "./BackButton";

export default function PageHeader({
  title,
  showBack = true,
}: {
  title?: string;
  showBack?: boolean;
}) {
  useEffect(() => {
    if (title) setPageTitle(title);
  }, [title]);

  useEffect(() => {
    setMobileBackVisible(showBack);
    return () => setMobileBackVisible(false);
  }, [showBack]);

  return (
    <div className="page-toolbar">
      {showBack && <BackButton className="page-toolbar__back" />}
      {title && <span className="page-title">{title}</span>}
    </div>
  );
}
