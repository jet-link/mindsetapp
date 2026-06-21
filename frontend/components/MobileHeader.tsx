"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BackButton from "@/components/BackButton";
import ExtrasMenu from "@/components/ExtrasMenu";
import { scheduleHomePageTitle } from "@/components/RouteTitle";
import {
  getMobileBackVisible,
  subscribeMobileBack,
} from "@/lib/mobile-back";
import { useMobileHeaderScroll } from "@/lib/use-mobile-header-scroll";

export default function MobileHeader() {
  const [showBack, setShowBack] = useState(false);
  const hidden = useMobileHeaderScroll();

  useEffect(() => {
    setShowBack(getMobileBackVisible());
    return subscribeMobileBack(() => setShowBack(getMobileBackVisible()));
  }, []);

  return (
    <header className={`mobile-header${hidden ? " mobile-header--hidden" : ""}`}>
      <div className="mobile-header__start">
        {showBack ? (
          <BackButton className="mobile-header__back" />
        ) : (
          <Link
            href="/"
            className="mobile-header__logo"
            aria-label="Mindset"
            onClick={scheduleHomePageTitle}
          >
            <span className="logo-word">
              <span className="logo-mind">Mind</span>
              <span className="logo-set">set</span>
            </span>
          </Link>
        )}
      </div>
      <div className="mobile-header__end">
        <ExtrasMenu variant="header" />
      </div>
    </header>
  );
}
