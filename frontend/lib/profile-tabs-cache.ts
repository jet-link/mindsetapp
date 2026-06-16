import type { ProfileReply, Theme } from "@/lib/api";

export type ProfileTab = "themes" | "replies" | "media" | "reposts";

export type ProfileTabsSnapshot = {
  username: string;
  tab: ProfileTab;
  themes: Theme[];
  replies: ProfileReply[];
  nextCursor: string | null;
  scrollY: number;
};

let profileTabsCache: ProfileTabsSnapshot | null = null;

export function getProfileTabsCache(username: string): ProfileTabsSnapshot | null {
  if (!profileTabsCache || profileTabsCache.username !== username) return null;
  return profileTabsCache;
}

export function setProfileTabsCache(snapshot: ProfileTabsSnapshot | null) {
  profileTabsCache = snapshot;
}

export function clearProfileTabsCache() {
  profileTabsCache = null;
}

export function updateThemeLikeInProfileCache(
  themeId: number,
  liked: boolean,
  likesCount: number,
) {
  if (!profileTabsCache) return;
  profileTabsCache.themes = profileTabsCache.themes.map((t) =>
    t.id === themeId ? { ...t, is_liked: liked, likes_count: likesCount } : t,
  );
}

export function updateThemeRepostInProfileCache(
  themeId: number,
  reposted: boolean,
  repostsCount: number,
) {
  if (!profileTabsCache) return;
  if (profileTabsCache.tab === "reposts" && !reposted) {
    profileTabsCache.themes = profileTabsCache.themes.filter((t) => t.id !== themeId);
    return;
  }
  profileTabsCache.themes = profileTabsCache.themes.map((t) =>
    t.id === themeId
      ? { ...t, is_reposted: reposted, reposts_count: repostsCount }
      : t,
  );
}

export function profileTabsCacheHasContent(snapshot: ProfileTabsSnapshot): boolean {
  return snapshot.tab === "replies"
    ? snapshot.replies.length > 0
    : snapshot.themes.length > 0;
}
