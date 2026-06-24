import type { MediaItem, ProfileReply, ReplyCreatedDetail, Theme } from "@/lib/api";
import { getStoredUsername } from "@/lib/api";
import { findReplyInAllCaches, findThemeInAllCaches } from "@/lib/theme-cache-lookup";

export type ProfileTab = "themes" | "replies" | "media" | "reposts";

export const PROFILE_TABS: ProfileTab[] = ["themes", "replies", "media", "reposts"];

export type ProfileSlice = {
  themes: Theme[];
  replies: ProfileReply[];
  media: MediaItem[];
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

export function updateThemeRepliesInProfileCache(
  themeId: number,
  themeRepliesCount: number,
  parentId?: number | null,
  parentRepliesCount?: number,
) {
  mapCachedSlices((slice) => ({
    ...slice,
    themes: slice.themes.map((t) =>
      t.id === themeId ? { ...t, replies_count: themeRepliesCount } : t,
    ),
    replies: slice.replies.map((r) => {
      let next = r;
      if (r.theme.id === themeId) {
        next = { ...next, theme: { ...next.theme, replies_count: themeRepliesCount } };
      }
      if (parentId != null && r.id === parentId && parentRepliesCount !== undefined) {
        next = { ...next, replies_count: parentRepliesCount };
      }
      return next;
    }),
  }));
}

export function updateReplyLikeInProfileCache(replyId: number, liked: boolean, likesCount: number) {
  mapCachedSlices((slice) => ({
    ...slice,
    replies: slice.replies.map((r) =>
      r.id === replyId ? { ...r, is_liked: liked, likes_count: likesCount } : r,
    ),
  }));
}

export function updateReplyRepostInProfileCache(
  replyId: number,
  reposted: boolean,
  repostsCount: number,
) {
  mapCachedSlices((slice) => ({
    ...slice,
    replies: slice.replies.map((r) =>
      r.id === replyId ? { ...r, is_reposted: reposted, reposts_count: repostsCount } : r,
    ),
  }));
}

export function removeThemeFromProfileCache(themeId: number) {
  mapCachedSlices((slice, tab) => {
    const themes = slice.themes.filter((t) => t.id !== themeId);
    const replies = slice.replies.filter((r) => r.theme.id !== themeId);
    if (tab === "reposts") {
      return { ...slice, themes };
    }
    return { ...slice, themes, replies };
  });
}

export function removeReplyFromProfileCache(replyId: number, _themeId: number) {
  mapCachedSlices((slice) => ({
    ...slice,
    replies: slice.replies.filter((r) => r.id !== replyId),
  }));
}

export function findThemeInProfileCache(themeId: number): Theme | null {
  if (!profileTabsCache) return null;
  for (const tab of PROFILE_TABS) {
    const hit = profileTabsCache.slices[tab].themes.find((t) => t.id === themeId);
    if (hit) return hit;
    const nested = profileTabsCache.slices[tab].replies.find((r) => r.theme.id === themeId);
    if (nested) return nested.theme;
  }
  return null;
}

export function findReplyInProfileCache(replyId: number): ProfileReply | null {
  if (!profileTabsCache) return null;
  for (const tab of PROFILE_TABS) {
    const hit = profileTabsCache.slices[tab].replies.find((r) => r.id === replyId);
    if (hit) return hit;
  }
  return null;
}

export function buildProfileReplyFromCreated(
  detail: ReplyCreatedDetail,
): ProfileReply | null {
  const username = getStoredUsername();
  if (!username || detail.reply.author.username !== username) return null;
  const theme = findThemeInAllCaches(detail.themeId);
  if (!theme) return null;
  const parent =
    detail.parentId != null ? findReplyInAllCaches(detail.parentId) : null;
  return {
    ...detail.reply,
    theme: { ...theme, replies_count: detail.themeRepliesCount },
    parent,
  };
}

export function prependThemeToProfileCache(theme: Theme) {
  const username = getStoredUsername();
  if (!username || theme.author.username !== username || !profileTabsCache) return;
  if (profileTabsCache.username !== username) return;
  mapCachedSlices((slice, tab) => {
    if (tab !== "themes") return slice;
    // Незагруженный срез не «достраиваем» — он сам подтянет свежее при открытии.
    if (!slice.loaded) return slice;
    if (slice.themes.some((t) => t.id === theme.id)) return slice;
    return {
      ...slice,
      themes: [theme, ...slice.themes],
    };
  });
}

export function prependReplyToProfileCache(profileReply: ProfileReply) {
  const username = getStoredUsername();
  if (!username || profileReply.author.username !== username || !profileTabsCache) return;
  if (profileTabsCache.username !== username) return;
  mapCachedSlices((slice, tab) => {
    if (tab !== "replies") return slice;
    if (!slice.loaded) return slice;
    if (slice.replies.some((r) => r.id === profileReply.id)) return slice;
    return {
      ...slice,
      replies: [profileReply, ...slice.replies],
    };
  });
}

/** Пометить срез вкладки на дозагрузку: при следующем открытии — свежий fetch. */
export function markProfileSliceStale(tab: ProfileTab) {
  const username = getStoredUsername();
  if (!username || !profileTabsCache || profileTabsCache.username !== username) return;
  const slice = profileTabsCache.slices[tab];
  if (!slice.loaded) return;
  profileTabsCache = {
    ...profileTabsCache,
    slices: { ...profileTabsCache.slices, [tab]: { ...slice, loaded: false } },
  };
}

/** Репост с ленты/треда: обновляем флаги в загруженных срезах профиля.
 * Если вкладки профиля ещё не открывались (нет кэша) — ничего не подделываем:
 * при открытии Reposts данные подтянутся свежими с сервера. */
export function prependRepostToProfileCache(theme: Theme) {
  const username = getStoredUsername();
  if (!username || !profileTabsCache || profileTabsCache.username !== username) return;

  const repostedTheme = { ...theme, is_reposted: true };

  mapCachedSlices((slice, tab) => {
    if (tab !== "reposts") {
      return {
        ...slice,
        themes: slice.themes.map((t) =>
          t.id === theme.id
            ? { ...t, is_reposted: true, reposts_count: repostedTheme.reposts_count }
            : t,
        ),
        replies: slice.replies.map((r) =>
          r.theme.id === theme.id
            ? {
                ...r,
                theme: {
                  ...r.theme,
                  is_reposted: true,
                  reposts_count: repostedTheme.reposts_count,
                },
              }
            : r,
        ),
      };
    }
    // Незагруженный срез репостов не достраиваем — подтянется свежим при открытии.
    if (!slice.loaded) return slice;
    const themes = slice.themes.some((t) => t.id === theme.id)
      ? slice.themes.map((t) => (t.id === theme.id ? { ...t, ...repostedTheme } : t))
      : [repostedTheme, ...slice.themes];
    return { ...slice, themes };
  });
}
