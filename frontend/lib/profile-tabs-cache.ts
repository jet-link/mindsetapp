import type { ProfileReply, Theme } from "@/lib/api";

export type ProfileTab = "themes" | "replies" | "media" | "reposts";

export const PROFILE_TABS: ProfileTab[] = ["themes", "replies", "media", "reposts"];

export type ProfileSlice = {
  themes: Theme[];
  replies: ProfileReply[];
  nextCursor: string | null;
  loaded: boolean;
};

export type ProfileTabsSnapshot = {
  username: string;
  tab: ProfileTab;
  slices: Record<ProfileTab, ProfileSlice>;
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

function mapCachedSlices(
  fn: (slice: ProfileSlice, tab: ProfileTab) => ProfileSlice,
) {
  if (!profileTabsCache) return;
  const next = { ...profileTabsCache.slices };
  for (const tab of PROFILE_TABS) {
    next[tab] = fn(profileTabsCache.slices[tab], tab);
  }
  profileTabsCache = { ...profileTabsCache, slices: next };
}

export function updateThemeLikeInProfileCache(
  themeId: number,
  liked: boolean,
  likesCount: number,
) {
  mapCachedSlices((slice) => ({
    ...slice,
    themes: slice.themes.map((t) =>
      t.id === themeId ? { ...t, is_liked: liked, likes_count: likesCount } : t,
    ),
    replies: slice.replies.map((r) =>
      r.theme.id === themeId
        ? { ...r, theme: { ...r.theme, is_liked: liked, likes_count: likesCount } }
        : r,
    ),
  }));
}

export function updateThemeRepostInProfileCache(
  themeId: number,
  reposted: boolean,
  repostsCount: number,
) {
  mapCachedSlices((slice, tab) => {
    if (tab === "reposts" && !reposted) {
      return { ...slice, themes: slice.themes.filter((t) => t.id !== themeId) };
    }
    return {
      ...slice,
      themes: slice.themes.map((t) =>
        t.id === themeId
          ? { ...t, is_reposted: reposted, reposts_count: repostsCount }
          : t,
      ),
      replies: slice.replies.map((r) =>
        r.theme.id === themeId
          ? { ...r, theme: { ...r.theme, is_reposted: reposted, reposts_count: repostsCount } }
          : r,
      ),
    };
  });
}
