import type { Theme } from "@/lib/api";

export type FeedSnapshot = {
  themes: Theme[];
  nextCursor: string | null;
  scrollY: number;
};

// Лента threads-стиля имеет несколько вкладок (for-you / following), поэтому
// кэш храним по ключу вкладки, чтобы при переключении не терять прокрутку.
const feedCaches: Record<string, FeedSnapshot> = {};
let lastTab = "for-you";

// --- Дисковый кэш (localStorage): мгновенный показ при повторном открытии ---
// Кэшируем только публичную вкладку «for-you»: вкладка «following» зависит от
// пользователя, и держать её на диске между сессиями небезопасно.
const DISK_TABS = ["for-you"];
const DISK_MAX_POSTS = 150;
const DISK_KEY_PREFIX = "mindset_feed_v1_";

let diskHydrated = false;
const hydratedFromDisk = new Set<string>();

function diskKey(tab: string): string {
  return `${DISK_KEY_PREFIX}${tab}`;
}

function readDisk(tab: string): FeedSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(diskKey(tab));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { themes?: Theme[]; nextCursor?: string | null };
    if (!parsed || !Array.isArray(parsed.themes) || parsed.themes.length === 0) {
      return null;
    }
    return {
      themes: parsed.themes,
      nextCursor: parsed.nextCursor ?? null,
      scrollY: 0,
    };
  } catch {
    return null;
  }
}

function writeDisk(tab: string, snapshot: FeedSnapshot) {
  if (typeof window === "undefined" || !DISK_TABS.includes(tab)) return;
  try {
    const truncated = snapshot.themes.length > DISK_MAX_POSTS;
    const themes = truncated
      ? snapshot.themes.slice(0, DISK_MAX_POSTS)
      : snapshot.themes;
    // Если список усечён, сохранённый nextCursor указывал бы мимо последнего
    // сохранённого поста (был бы разрыв) — обнуляем его, ревалидация подтянет
    // свежий курсор с первой страницы.
    const nextCursor = truncated ? null : snapshot.nextCursor;
    window.localStorage.setItem(diskKey(tab), JSON.stringify({ themes, nextCursor }));
  } catch {
    // Переполнение квоты или приватный режим — просто пропускаем дисковый кэш.
  }
}

function clearDisk(tab?: string) {
  if (typeof window === "undefined") return;
  try {
    if (tab) {
      window.localStorage.removeItem(diskKey(tab));
    } else {
      for (const t of DISK_TABS) window.localStorage.removeItem(diskKey(t));
    }
  } catch {
    // ignore
  }
}

/**
 * Один раз за сессию поднимаем дисковый кэш в память (для мгновенного показа).
 * ВАЖНО: вызывать только после монтирования (в useEffect), а не во время рендера
 * — иначе серверный HTML (без localStorage) не совпадёт с клиентским и будет
 * ошибка гидрации.
 */
export function hydrateFeedCacheFromDisk() {
  if (diskHydrated || typeof window === "undefined") return;
  diskHydrated = true;
  for (const tab of DISK_TABS) {
    if (feedCaches[tab]) continue;
    const snap = readDisk(tab);
    if (snap) {
      feedCaches[tab] = snap;
      hydratedFromDisk.add(tab);
    }
  }
}

/** Была ли вкладка поднята именно из дискового кэша (стейл, нужна ревалидация). */
export function wasHydratedFromDisk(tab: string): boolean {
  return hydratedFromDisk.has(tab);
}

/** После успешной ревалидации помечаем вкладку как свежую. */
export function markFeedRevalidated(tab: string) {
  hydratedFromDisk.delete(tab);
}

export function getLastFeedTab(): string {
  return lastTab;
}

export function setLastFeedTab(tab: string) {
  lastTab = tab;
}

export function getFeedCache(tab: string = lastTab): FeedSnapshot | null {
  return feedCaches[tab] ?? null;
}

export function setFeedCache(tab: string, snapshot: FeedSnapshot | null) {
  if (snapshot === null) {
    delete feedCaches[tab];
    clearDisk(tab);
  } else {
    feedCaches[tab] = snapshot;
    writeDisk(tab, snapshot);
  }
}

export function clearFeedCache() {
  for (const key of Object.keys(feedCaches)) delete feedCaches[key];
  hydratedFromDisk.clear();
  clearDisk();
}

function updateAllCaches(fn: (snapshot: FeedSnapshot) => void) {
  for (const snapshot of Object.values(feedCaches)) fn(snapshot);
}

export function updateThemeLikeInFeedCache(
  themeId: number,
  liked: boolean,
  likesCount: number,
) {
  updateAllCaches((c) => {
    c.themes = c.themes.map((t) =>
      t.id === themeId ? { ...t, is_liked: liked, likes_count: likesCount } : t,
    );
  });
}

export function updateThemeRepostInFeedCache(
  themeId: number,
  reposted: boolean,
  repostsCount: number,
) {
  updateAllCaches((c) => {
    c.themes = c.themes.map((t) =>
      t.id === themeId ? { ...t, is_reposted: reposted, reposts_count: repostsCount } : t,
    );
  });
}

export function prependThemeToFeedCache(theme: Theme) {
  // Своя новая тема — только во вкладку For you, не в Following.
  // Не создаём кэш с одной темой: иначе лента помечается loaded и не догружает остальное.
  const cache = feedCaches["for-you"];
  if (!cache) return;
  if (cache.themes.some((t) => t.id === theme.id)) return;
  cache.themes = [theme, ...cache.themes];
}

export function updateThemeRepliesInFeedCache(themeId: number, repliesCount: number) {
  updateAllCaches((c) => {
    c.themes = c.themes.map((t) =>
      t.id === themeId ? { ...t, replies_count: repliesCount } : t,
    );
  });
}

export function removeAuthorFromFollowingFeedCache(username: string) {
  const cache = feedCaches["following"];
  if (!cache) return;
  cache.themes = cache.themes.filter((t) => t.author.username !== username);
}

/** Сбрасывает кэш вкладки Following, чтобы при следующем открытии она
 * подтянула полный актуальный список с сервера (источник правды по
 * хронологии и пагинации). Используется при подписке на нового автора. */
export function invalidateFollowingFeedCache() {
  delete feedCaches["following"];
}

export function updateAuthorAvatarInFeedCache(username: string, avatar: string | null) {
  updateAllCaches((c) => {
    c.themes = c.themes.map((t) =>
      t.author.username === username
        ? { ...t, author: { ...t.author, avatar } }
        : t,
    );
  });
}

export function removeThemeFromFeedCache(themeId: number) {
  updateAllCaches((c) => {
    c.themes = c.themes.filter((t) => t.id !== themeId);
  });
}

export function findThemeInFeedCaches(themeId: number): Theme | null {
  for (const snapshot of Object.values(feedCaches)) {
    const hit = snapshot.themes.find((t) => t.id === themeId);
    if (hit) return hit;
  }
  return null;
}
