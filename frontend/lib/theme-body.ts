export const THEME_BODY_LIMIT = 500;

/** Два и более переноса подряд → один (считается как 1 символ). */
export function normalizeThemeBody(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\n{2,}/g, "\n");
}

export function themeCharCount(text: string): number {
  return normalizeThemeBody(text).length;
}
