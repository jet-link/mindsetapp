/** Mirrors backend `THEME_COOLDOWN` / `REPLY_COOLDOWN` min_interval values. */
export const THEME_COOLDOWN_SECONDS = 30;
export const REPLY_COOLDOWN_SECONDS = 10;

export type CooldownScope = "theme" | "reply";

const KEY_PREFIX = "mindset:cooldown:";

function storageKey(scope: CooldownScope) {
  return `${KEY_PREFIX}${scope}`;
}

export function getCooldownRemaining(scope: CooldownScope): number {
  if (typeof sessionStorage === "undefined") return 0;
  const raw = sessionStorage.getItem(storageKey(scope));
  if (!raw) return 0;
  const endsAt = Number(raw);
  if (!Number.isFinite(endsAt)) {
    sessionStorage.removeItem(storageKey(scope));
    return 0;
  }
  const remaining = Math.ceil((endsAt - Date.now()) / 1000);
  if (remaining <= 0) {
    sessionStorage.removeItem(storageKey(scope));
    return 0;
  }
  return remaining;
}

export function setCooldown(scope: CooldownScope, seconds: number) {
  if (typeof sessionStorage === "undefined" || seconds <= 0) return;
  const existingRaw = sessionStorage.getItem(storageKey(scope));
  const existingEnd = existingRaw ? Number(existingRaw) : 0;
  const newEnd = Date.now() + seconds * 1000;
  sessionStorage.setItem(
    storageKey(scope),
    String(Math.max(Number.isFinite(existingEnd) ? existingEnd : 0, newEnd)),
  );
}
