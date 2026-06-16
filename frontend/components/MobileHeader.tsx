"use client";

import Link from "next/link";

export default function MobileHeader() {
  return (
    <header className="mobile-header">
      <Link href="/" className="mobile-header__logo" aria-label="Mindset">
        <span className="logo-mind">Mind</span>
        <span className="logo-set">set</span>
      </Link>
    </header>
  );
}
