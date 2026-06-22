"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import ReportProblemModal from "@/components/ReportProblemModal";

type ExtrasPanelView = "menu" | "theme" | "language";
type ThemeMode = "sun" | "night" | "auto";
type LanguageMode = "eng" | "rus";

function SegmentToggle<T extends string>({
  options,
  value,
  onChange,
  twoColumns,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode; text?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  twoColumns?: boolean;
  ariaLabel: string;
}) {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );

  return (
    <div
      className={`sidenav__segment-toggle${twoColumns ? " sidenav__segment-toggle--2" : ""}`}
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ "--active-index": activeIndex } as CSSProperties}
    >
      <span className="sidenav__segment-indicator" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`sidenav__segment-option${
            option.text ? " sidenav__segment-option--text" : ""
          }${value === option.value ? " active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

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
  const [reportOpen, setReportOpen] = useState(false);
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
              <button
                type="button"
                className="sidenav__extras-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setReportOpen(true);
                }}
              >
                Report a problem
              </button>
            </>
          ) : panelView === "theme" ? (
            <ExtrasSubpanel title="Theme" onBack={() => setPanelView("menu")}>
              <SegmentToggle
                ariaLabel="Theme"
                value={themeMode}
                onChange={setThemeMode}
                options={[
                  {
                    value: "sun",
                    label: <i className="fa fa-sun" aria-hidden="true" />,
                  },
                  {
                    value: "night",
                    label: <i className="fa fa-moon-o" aria-hidden="true" />,
                  },
                  { value: "auto", label: "Auto", text: true },
                ]}
              />
            </ExtrasSubpanel>
          ) : (
            <ExtrasSubpanel title="Language" onBack={() => setPanelView("menu")}>
              <SegmentToggle
                ariaLabel="Language"
                twoColumns
                value={languageMode}
                onChange={setLanguageMode}
                options={[
                  { value: "eng", label: "ENG", text: true },
                  { value: "rus", label: "RUS", text: true },
                ]}
              />
            </ExtrasSubpanel>
          )}
        </div>
      )}
      <ReportProblemModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}
