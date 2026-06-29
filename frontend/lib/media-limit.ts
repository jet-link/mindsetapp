import i18n, { initI18n } from "./i18n/config";

export type MediaLimitKind = "theme" | "reply";

export function mediaLimitExceededMessage(
  kind: MediaLimitKind,
  count: number,
  max: number,
): string {
  const excess = count - max;
  if (excess <= 0) return "";
  if (!i18n.isInitialized) initI18n();
  const noun = i18n.t("errors:image", { count: excess });
  const kindWord = i18n.t(kind === "theme" ? "errors:kindTheme" : "errors:kindReply");
  return i18n.t("errors:mediaLimitExceeded", { kind: kindWord, count: excess, noun });
}
