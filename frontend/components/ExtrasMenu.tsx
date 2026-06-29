"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import ReportProblemModal from "@/components/ReportProblemModal";
import { AUTH_EVENT, isLoggedIn, updateMeLanguage } from "@/lib/api";
import {
  DEFAULT_THEME_MODE,
  THEME_CHANGE_EVENT,
  getStoredThemeMode,
  setThemeMode as persistThemeMode,
  watchSystemTheme,
  type ThemeMode,
} from "@/lib/theme";
import {
  LOCALE_CHANGE_EVENT,
  SUPPORTED_LANGUAGES,
  getActiveLocale,
  getStoredLocale,
  setLocale,
  type Locale,
} from "@/lib/i18n";

type ExtrasPanelView = "menu" | "theme" | "language";

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
  const { t } = useTranslation("settings");
  return (
    <div className="sidenav__extras-subpanel">
      <div className="sidenav__extras-subpanel-head">
        <button
          type="button"
          className="sidenav__extras-back"
          aria-label={t("back")}
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
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const [panelView, setPanelView] = useState<ExtrasPanelView>("menu");
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [locale, setLocaleState] = useState<Locale>("en");
  const [reportOpen, setReportOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onAuthChange = () => {
      if (!isLoggedIn()) setReportOpen(false);
    };
    window.addEventListener(AUTH_EVENT, onAuthChange);
    return () => window.removeEventListener(AUTH_EVENT, onAuthChange);
  }, []);

  // Синхронизируем выбранный режим из localStorage, между инстансами меню
  // (sidenav + header) и реагируем на системную смену темы в режиме "auto".
  useEffect(() => {
    setThemeMode(getStoredThemeMode());
    const onThemeChange = (e: Event) => {
      const next = (e as CustomEvent<ThemeMode>).detail;
      if (next) setThemeMode(next);
    };
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    const unwatch = watchSystemTheme(getStoredThemeMode);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
      unwatch();
    };
  }, []);

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    persistThemeMode(mode);
  };

  // Синхронизируем активный язык из хранилища и между инстансами меню.
  useEffect(() => {
    setLocaleState(getStoredLocale());
    const onLocaleChange = (e: Event) => {
      const next = (e as CustomEvent<Locale>).detail;
      if (next) setLocaleState(next);
    };
    window.addEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);
  }, []);

  const handleLanguageChange = (next: Locale) => {
    if (next === getActiveLocale()) return;
    setLocaleState(next);
    void setLocale(next);
    // Авторизованным сохраняем выбор в профиле (для синхронизации между устройствами).
    if (isLoggedIn()) {
      updateMeLanguage(next).catch(() => {});
    }
  };

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
        aria-label={t("menu")}
        aria-expanded={open}
        title={t("menu")}
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
                {t("theme")}
                <i className="fa fa-chevron-right" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="sidenav__extras-item sidenav__extras-item--nav"
                role="menuitem"
                onClick={() => setPanelView("language")}
              >
                {t("language")}
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
                {t("reportProblem")}
              </button>
            </>
          ) : panelView === "theme" ? (
            <ExtrasSubpanel title={t("theme")} onBack={() => setPanelView("menu")}>
              <SegmentToggle
                ariaLabel={t("themeAria")}
                value={themeMode}
                onChange={handleThemeChange}
                options={[
                  {
                    value: "sun",
                    label: <i className="fa fa-sun" aria-hidden="true" />,
                  },
                  {
                    value: "night",
                    label: <i className="fa fa-moon-o" aria-hidden="true" />,
                  },
                  { value: "auto", label: t("auto"), text: true },
                ]}
              />
            </ExtrasSubpanel>
          ) : (
            <ExtrasSubpanel title={t("language")} onBack={() => setPanelView("menu")}>
              <SegmentToggle
                ariaLabel={t("languageAria")}
                value={locale}
                onChange={handleLanguageChange}
                options={SUPPORTED_LANGUAGES.map((lang) => ({
                  value: lang.code,
                  label: lang.label,
                  text: true,
                }))}
              />
            </ExtrasSubpanel>
          )}
        </div>
      )}
      <ReportProblemModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}
