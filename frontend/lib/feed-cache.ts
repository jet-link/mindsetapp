import type { Theme } from "@/lib/api";

export type FeedSnapshot = {
  themes: Theme[];
  nextCursor: string | null;
  scrollY: number;
};

let feedCache: FeedSnapshot | null = null;

export function getFeedCache(): FeedSnapshot | null {
  return feedCache;
}

export function setFeedCache(snapshot: FeedSnapshot | null) {
  feedCache = snapshot;
}

export function clearFeedCache() {
  feedCache = null;
}

export function updateThemeLikeInFeedCache(
  themeId: number,
  liked: boolean,
  likesCount: number,
) {
  if (!feedCache) return;
  feedCache.themes = feedCache.themes.map((t) =>
    t.id === themeId ? { ...t, is_liked: liked, likes_count: likesCount } : t,
  );
}

export function updateThemeRepostInFeedCache(
  themeId: number,
  reposted: boolean,
  repostsCount: number,
) {
  if (!feedCache) return;
  feedCache.themes = feedCache.themes.map((t) =>
    t.id === themeId ? { ...t, is_reposted: reposted, reposts_count: repostsCount } : t,
  );
}

export function prependThemeToFeedCache(theme: Theme) {
  if (!feedCache) {
    feedCache = { themes: [], nextCursor: null, scrollY: 0 };
  }
  if (feedCache.themes.some((t) => t.id === theme.id)) return;
  feedCache.themes = [theme, ...feedCache.themes];
}

export function updateThemeRepliesInFeedCache(themeId: number, repliesCount: number) {
  if (!feedCache) return;
  feedCache.themes = feedCache.themes.map((t) =>
    t.id === themeId ? { ...t, replies_count: repliesCount } : t,
  );
}

export function updateAuthorAvatarInFeedCache(username: string, avatar: string | null) {
  if (!feedCache) return;
  feedCache.themes = feedCache.themes.map((t) =>
    t.author.username === username
      ? { ...t, author: { ...t.author, avatar } }
      : t,
  );
}
