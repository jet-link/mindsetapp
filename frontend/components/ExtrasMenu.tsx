"use client";

import { useEffect, useRef, useState } from "react";

export default function ExtrasMenu({ variant = "sidenav" }: { variant?: "sidenav" | "header" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div
      className={`extras-menu${variant === "header" ? " extras-menu--header" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="sidenav__bars"
        aria-label="Menu"
        aria-expanded={open}
        title="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span />
        <span />
      </button>
      {open && (
        <div className="sidenav__extras-panel" role="menu">
          <button type="button" className="sidenav__extras-item" role="menuitem">
            <i className="fa fa-sun" aria-hidden="true" />
            Theme
          </button>
          <button type="button" className="sidenav__extras-item" role="menuitem">
            <i className="fa fa-language" aria-hidden="true" />
            Language
          </button>
          <button type="button" className="sidenav__extras-item" role="menuitem">
            <i className="fa fa-bullhorn" aria-hidden="true" />
            Report a problem
          </button>
        </div>
      )}
    </div>
  );
}
