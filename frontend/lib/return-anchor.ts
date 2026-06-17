export type AnchorKind = "theme" | "reply";

export interface ReturnAnchor {
  listKey: string;
  kind: AnchorKind;
  id: number;
  savedAt: number;
}

const ANCHOR_TTL_MS = 5 * 60_000;

let currentListKey = "/";
// Якоря по уровням навигации (ключ = listKey). Так возврат на несколько
// уровней назад (reply → theme → лента) восстанавливает позицию на каждом.
const anchors = new Map<string, ReturnAnchor>();

/** Текущий «список», с которого уходим в детальную (лента, тег, профиль, тред…). */
export function setListKey(key: string) {
  currentListKey = key;
}

export function getListKey(): string {
  return currentListKey;
}

export function parseListKeySearchParams(listKey: string): URLSearchParams {
  const idx = listKey.indexOf("?");
  if (idx === -1) return new URLSearchParams();
  return new URLSearchParams(listKey.slice(idx + 1));
}

function isFresh(anchor: ReturnAnchor): boolean {
  return Date.now() - anchor.savedAt < ANCHOR_TTL_MS;
}

function getAnchor(listKey: string): ReturnAnchor | null {
  const anchor = anchors.get(listKey);
  if (!anchor) return null;
  if (!isFresh(anchor)) {
    anchors.delete(listKey);
    return null;
  }
  return anchor;
}

export function peekReturnAnchorForList(listKey: string): ReturnAnchor | null {
  return getAnchor(listKey);
}

export function hasPendingReturnAnchor(listKey: string): boolean {
  return getAnchor(listKey) !== null;
}

/** Первый свежий якорь, listKey которого начинается с префикса (для выбора вкладки). */
export function findReturnAnchorByPrefix(prefix: string): ReturnAnchor | null {
  for (const [key, anchor] of anchors) {
    if (!isFresh(anchor)) {
      anchors.delete(key);
      continue;
    }
    if (key.startsWith(prefix)) return anchor;
  }
  return null;
}

export function saveReturnAnchor(anchor: {
  listKey?: string;
  kind: AnchorKind;
  id: number;
}) {
  const listKey = anchor.listKey ?? currentListKey;
  anchors.set(listKey, {
    listKey,
    kind: anchor.kind,
    id: anchor.id,
    savedAt: Date.now(),
  });
}

export function clearReturnAnchor(listKey: string) {
  anchors.delete(listKey);
}

export function anchorSelector(kind: AnchorKind, id: number): string {
  return `[data-anchor-${kind}="${id}"]`;
}

function findAnchorElement(kind: AnchorKind, id: number): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(anchorSelector(kind, id));
  for (const el of nodes) {
    if (el.closest("[hidden]")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height > 0 && rect.width > 0) return el;
  }
  return nodes[0] ?? null;
}

/** Мгновенно центрирует карточку в окне (без smooth-scroll). */
export function scrollToAnchor(anchor: ReturnAnchor): boolean {
  const el = findAnchorElement(anchor.kind, anchor.id);
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const top = rect.top + window.scrollY - (window.innerHeight - rect.height) / 2;
  window.scrollTo({ top: Math.max(0, top), left: 0, behavior: "auto" });
  return true;
}
