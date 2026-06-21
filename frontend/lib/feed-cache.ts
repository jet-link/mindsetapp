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
  updateAllCaches((c) => {
    if (c.themes.some((t) => t.id === theme.id)) return;
    c.themes = [theme, ...c.themes];
  });
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

function sortThemesByDate(themes: Theme[]): Theme[] {
  return [...themes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/** Добавляет темы нового followee во вкладку Following (хронологически). */
export function addAuthorThemesToFollowingFeedCache(themes: Theme[]) {
  if (!themes.length) return;
  const existing = feedCaches["following"];
  if (!existing) {
    feedCaches["following"] = {
      themes: sortThemesByDate(themes),
      nextCursor: null,
      scrollY: 0,
    };
    return;
  }
  const ids = new Set(existing.themes.map((t) => t.id));
  const merged = [...existing.themes];
  for (const theme of themes) {
    if (!ids.has(theme.id)) {
      merged.push(theme);
      ids.add(theme.id);
    }
  }
  existing.themes = sortThemesByDate(merged);
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
