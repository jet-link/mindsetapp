export type AnchorKind = "theme" | "reply" | "media";

export interface ReturnAnchor {
  listKey: string;
  kind: AnchorKind;
  id: number;
  savedAt: number;
  /** Позиция верха карточки в окне в момент ухода — для пиксель-точного возврата. */
  viewportTop?: number;
  /** Целевой scrollTop на случай, если карточка исчезла из DOM (unrepost, delete). */
  fallbackScrollY?: number;
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
  viewportTop?: number;
  fallbackScrollY?: number;
}) {
  const listKey = anchor.listKey ?? currentListKey;
  anchors.set(listKey, {
    listKey,
    kind: anchor.kind,
    id: anchor.id,
    savedAt: Date.now(),
    viewportTop: anchor.viewportTop,
    fallbackScrollY: anchor.fallbackScrollY,
  });
}

/** Сохраняет якорь по DOM-элементу карточки — с fallback scrollY на случай удаления. */
export function saveReturnAnchorFromElement(
  el: HTMLElement,
  anchor: { listKey?: string; kind: AnchorKind; id: number },
) {
  const rect = el.getBoundingClientRect();
  const viewportTop = rect.top;
  const absTop = rect.top + window.scrollY;
  const inset = topInset();
  const fallbackScrollY = Math.max(0, absTop - Math.max(viewportTop, inset + 4));
  saveReturnAnchor({ ...anchor, viewportTop, fallbackScrollY });
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

/** Высота видимого фиксированного хедера (моб.) — чтобы карточка не ушла под него. */
function topInset(): number {
  if (typeof document === "undefined") return 0;
  const header = document.querySelector<HTMLElement>(".mobile-header");
  if (!header || getComputedStyle(header).display === "none") return 0;
  return Math.max(0, header.getBoundingClientRect().bottom);
}

/**
 * Целевой scrollTop для якоря или null, если элемент ещё не в DOM.
 * Если сохранён viewportTop — карточка встаёт ровно на ту же высоту экрана,
 * где была в момент ухода (пиксель-точно), иначе центрируется в окне.
 */
export function computeAnchorTop(anchor: ReturnAnchor): number | null {
  const el = findAnchorElement(anchor.kind, anchor.id);
  if (el) {
    const rect = el.getBoundingClientRect();
    const absTop = rect.top + window.scrollY;
    const top =
      typeof anchor.viewportTop === "number"
        ? absTop - Math.max(anchor.viewportTop, topInset() + 4)
        : absTop - (window.innerHeight - rect.height) / 2;
    return Math.max(0, top);
  }
  // Карточка удалена (unrepost, delete) — восстанавливаем ту же область прокрутки.
  if (typeof anchor.fallbackScrollY === "number") {
    return Math.max(0, anchor.fallbackScrollY);
  }
  return null;
}

/** Мгновенно (без smooth-scroll) возвращает к карточке. */
export function scrollToAnchor(anchor: ReturnAnchor): boolean {
  const top = computeAnchorTop(anchor);
  if (top === null) return false;
  window.scrollTo({ top, left: 0, behavior: "instant" as ScrollBehavior });
  return true;
}
