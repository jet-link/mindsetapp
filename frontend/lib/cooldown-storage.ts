/** Mirrors backend `THEME_COOLDOWN` / `REPLY_COOLDOWN` min_interval values. */
export const THEME_COOLDOWN_SECONDS = 30;
export const REPLY_COOLDOWN_SECONDS = 10;

export type CooldownScope = "theme" | "reply";

const KEY_PREFIX = "mindset:cooldown:";

/**
 * Ключ кулдауна. `target` (например, `theme:5` или `reply:12`) делает блокировку
 * точечной: ответ конкретной теме/ответу не блокирует формы других тем/ответов.
 */
function storageKey(scope: CooldownScope, target?: string) {
  return `${KEY_PREFIX}${scope}${target ? `:${target}` : ""}`;
}

export function getCooldownRemaining(scope: CooldownScope, target?: string): number {
  if (typeof sessionStorage === "undefined") return 0;
  const key = storageKey(scope, target);
  const raw = sessionStorage.getItem(key);
  if (!raw) return 0;
  const endsAt = Number(raw);
  if (!Number.isFinite(endsAt)) {
    sessionStorage.removeItem(key);
    return 0;
  }
  const remaining = Math.ceil((endsAt - Date.now()) / 1000);
  if (remaining <= 0) {
    sessionStorage.removeItem(key);
    return 0;
  }
  return remaining;
}

export function setCooldown(scope: CooldownScope, seconds: number, target?: string) {
  if (typeof sessionStorage === "undefined" || seconds <= 0) return;
  const key = storageKey(scope, target);
  const existingRaw = sessionStorage.getItem(key);
  const existingEnd = existingRaw ? Number(existingRaw) : 0;
  const newEnd = Date.now() + seconds * 1000;
  sessionStorage.setItem(
    key,
    String(Math.max(Number.isFinite(existingEnd) ? existingEnd : 0, newEnd)),
  );
}
