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
  } else {
    feedCaches[tab] = snapshot;
  }
}

export function clearFeedCache() {
  for (const key of Object.keys(feedCaches)) delete feedCaches[key];
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
