export type MediaLimitKind = "theme" | "reply";

export function mediaLimitExceededMessage(
  kind: MediaLimitKind,
  count: number,
  max: number,
): string {
  const excess = count - max;
  if (excess <= 0) return "";
  const noun = excess === 1 ? "image" : "images";
  return `You have exceeded the image limit for this ${kind}. Please remove ${excess} ${noun}.`;
}
