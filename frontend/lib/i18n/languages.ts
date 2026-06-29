// Поддерживаемые языки приложения. Чтобы добавить новый язык, достаточно
// расширить SUPPORTED_LOCALES и создать папку locales/<код> с теми же файлами
// переводов — остальная архитектура (ленивая загрузка, fallback, переключатель)
// подхватит его автоматически.

export type Locale = "en" | "ru" | "uz";

export type TextDirection = "ltr" | "rtl";

export interface LanguageMeta {
  /** Код языка (ISO 639-1) — используется в API, Accept-Language и хранилище. */
  code: Locale;
  /** Краткая подпись для переключателя (ENG / RUS / UZB). */
  label: string;
  /** Направление текста. RTL пока не используется, но архитектура готова. */
  dir: TextDirection;
}

export const DEFAULT_LOCALE: Locale = "en";

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  { code: "en", label: "ENG", dir: "ltr" },
  { code: "ru", label: "RUS", dir: "ltr" },
  { code: "uz", label: "UZB", dir: "ltr" },
];

export const SUPPORTED_LOCALES: Locale[] = SUPPORTED_LANGUAGES.map((l) => l.code);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as Locale);
}

export function getLanguageMeta(locale: Locale): LanguageMeta {
  return (
    SUPPORTED_LANGUAGES.find((l) => l.code === locale) ?? SUPPORTED_LANGUAGES[0]
  );
}

export function getTextDirection(locale: Locale): TextDirection {
  return getLanguageMeta(locale).dir;
}
