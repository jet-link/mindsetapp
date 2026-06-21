"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type ExtrasPanelView = "menu" | "theme" | "language";
type ThemeMode = "sun" | "night" | "auto";
type LanguageMode = "eng" | "rus";

function ExtrasSubpanel({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sidenav__extras-subpanel">
      <div className="sidenav__extras-subpanel-head">
        <button
          type="button"
          className="sidenav__extras-back"
          aria-label="Back"
          onClick={onBack}
        >
          <i className="fa fa-arrow-left" aria-hidden="true" />
        </button>
        <span className="sidenav__extras-subpanel-title">{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function ExtrasMenu({ variant = "sidenav" }: { variant?: "sidenav" | "header" }) {
  const [open, setOpen] = useState(false);
  const [panelView, setPanelView] = useState<ExtrasPanelView>("menu");
  const [themeMode, setThemeMode] = useState<ThemeMode>("sun");
  const [languageMode, setLanguageMode] = useState<LanguageMode>("eng");
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
              <button
                type="button"
                className="sidenav__extras-item sidenav__extras-item--nav"
                role="menuitem"
                onClick={() => setPanelView("language")}
              >
                Language
                <i className="fa fa-chevron-right" aria-hidden="true" />
              </button>
              <button type="button" className="sidenav__extras-item" role="menuitem">
                Report a problem
              </button>
            </>
          ) : panelView === "theme" ? (
            <ExtrasSubpanel title="Theme" onBack={() => setPanelView("menu")}>
              <div className="sidenav__segment-toggle" role="radiogroup" aria-label="Theme">
                <button
                  type="button"
                  role="radio"
                  aria-checked={themeMode === "sun"}
                  className={`sidenav__segment-option${themeMode === "sun" ? " active" : ""}`}
                  onClick={() => setThemeMode("sun")}
                >
                  <i className="fa fa-sun" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={themeMode === "night"}
                  className={`sidenav__segment-option${themeMode === "night" ? " active" : ""}`}
                  onClick={() => setThemeMode("night")}
                >
                  <i className="fa fa-moon-o" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={themeMode === "auto"}
                  className={`sidenav__segment-option sidenav__segment-option--text${
                    themeMode === "auto" ? " active" : ""
                  }`}
                  onClick={() => setThemeMode("auto")}
                >
                  Auto
                </button>
              </div>
            </ExtrasSubpanel>
          ) : (
            <ExtrasSubpanel title="Language" onBack={() => setPanelView("menu")}>
              <div
                className="sidenav__segment-toggle sidenav__segment-toggle--2"
                role="radiogroup"
                aria-label="Language"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={languageMode === "eng"}
                  className={`sidenav__segment-option sidenav__segment-option--text${
                    languageMode === "eng" ? " active" : ""
                  }`}
                  onClick={() => setLanguageMode("eng")}
                >
                  ENG
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={languageMode === "rus"}
                  className={`sidenav__segment-option sidenav__segment-option--text${
                    languageMode === "rus" ? " active" : ""
                  }`}
                  onClick={() => setLanguageMode("rus")}
                >
                  RUS
                </button>
              </div>
            </ExtrasSubpanel>
          )}
        </div>
      )}
    </div>
  );
}
