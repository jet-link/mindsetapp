export type ThemeMode = "sun" | "night" | "auto";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "mindset-theme";
export const THEME_CHANGE_EVENT = "mindset:theme-change";

/** Светлая тема — базовая (как в макете). */
export const DEFAULT_THEME_MODE: ThemeMode = "sun";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "sun" || value === "night" || value === "auto";
}

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_THEME_MODE;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export function prefersDarkScheme(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(DARK_QUERY).matches
  );
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "sun") return "light";
  if (mode === "night") return "dark";
  return prefersDarkScheme() ? "dark" : "light";
}

/** Применяет тему к <html>: data-theme + color-scheme (нативные контролы/скроллбары). */
export function applyThemeMode(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.style.colorScheme = resolved;
  }
  return resolved;
}

/** Сохраняет режим, применяет его и оповещает остальные инстансы переключателя. */
export function setThemeMode(mode: ThemeMode): ResolvedTheme {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // localStorage может быть недоступен (приватный режим) — тему всё равно применяем.
    }
  }
  const resolved = applyThemeMode(mode);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, { detail: mode }));
  }
  return resolved;
}

/**
 * Следит за сменой системной темы и применяет её, пока активен режим "auto".
 * Возвращает функцию отписки.
 */
export function watchSystemTheme(getMode: () => ThemeMode): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const media = window.matchMedia(DARK_QUERY);
  const onChange = () => {
    if (getMode() === "auto") applyThemeMode("auto");
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
