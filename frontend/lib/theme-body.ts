export const THEME_BODY_LIMIT = 500;

/** Нормализует переводы строк: \r\n → \n. Каждый \n = 1 символ. */
export function normalizeThemeBody(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function themeCharCount(text: string): number {
  return normalizeThemeBody(text).length;
}
