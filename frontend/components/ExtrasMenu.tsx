"use client";

import { useEffect, useRef, useState } from "react";

type ExtrasPanelView = "menu" | "theme";
type ThemeMode = "sun" | "night" | "auto";

export default function ExtrasMenu({ variant = "sidenav" }: { variant?: "sidenav" | "header" }) {
  const [open, setOpen] = useState(false);
  const [panelView, setPanelView] = useState<ExtrasPanelView>("menu");
  const [themeMode, setThemeMode] = useState<ThemeMode>("sun");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) setPanelView("menu");
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
          {panelView === "menu" ? (
            <>
              <button
                type="button"
                className="sidenav__extras-item sidenav__extras-item--nav"
                role="menuitem"
                onClick={() => setPanelView("theme")}
              >
                Theme
                <i className="fa fa-chevron-right" aria-hidden="true" />
              </button>
              <button type="button" className="sidenav__extras-item" role="menuitem">
                Language
              </button>
              <button type="button" className="sidenav__extras-item" role="menuitem">
                Report a problem
              </button>
            </>
          ) : (
            <div className="sidenav__extras-theme">
              <div className="sidenav__extras-theme-head">
                <button
                  type="button"
                  className="sidenav__extras-back"
                  aria-label="Back"
                  onClick={() => setPanelView("menu")}
                >
                  <i className="fa fa-arrow-left" aria-hidden="true" />
                </button>
                <span className="sidenav__extras-theme-title">Theme</span>
              </div>
              <div
                className="sidenav__theme-toggle"
                role="radiogroup"
                aria-label="Theme"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={themeMode === "sun"}
                  className={`sidenav__theme-option${themeMode === "sun" ? " active" : ""}`}
                  onClick={() => setThemeMode("sun")}
                >
                  <i className="fa fa-sun" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={themeMode === "night"}
                  className={`sidenav__theme-option${themeMode === "night" ? " active" : ""}`}
                  onClick={() => setThemeMode("night")}
                >
                  <i className="fa fa-moon-o" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={themeMode === "auto"}
                  className={`sidenav__theme-option sidenav__theme-option--text${
                    themeMode === "auto" ? " active" : ""
                  }`}
                  onClick={() => setThemeMode("auto")}
                >
                  Auto
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
