import type { MediaItem, ProfileReply, ProfileRepost, Reply, ReplyCreatedDetail, Theme } from "@/lib/api";
import { getStoredUsername } from "@/lib/api";
import { findReplyInAllCaches, findThemeInAllCaches } from "@/lib/theme-cache-lookup";

export type ProfileTab = "themes" | "replies" | "media" | "reposts";

export const PROFILE_TABS: ProfileTab[] = ["themes", "replies", "media", "reposts"];

export type ProfileSlice = {
  themes: Theme[];
  replies: ProfileReply[];
  media: MediaItem[];
  reposts: ProfileRepost[];
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
    reposts: slice.reposts.map((item) =>
      item.kind === "theme" && item.theme?.id === themeId
        ? { ...item, theme: { ...item.theme, is_liked: liked, likes_count: likesCount } }
        : item,
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
      // Карточку уберём после exit-анимации на открытой вкладке Reposts.
      return slice;
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
    reposts: slice.reposts.map((item) => {
      if (item.kind === "theme" && item.theme?.id === themeId) {
        return { ...item, theme: { ...item.theme, replies_count: themeRepliesCount } };
      }
      if (
        item.kind === "reply" &&
        item.reply &&
        parentId != null &&
        item.reply.id === parentId &&
        parentRepliesCount !== undefined
      ) {
        return { ...item, reply: { ...item.reply, replies_count: parentRepliesCount } };
      }
      return item;
    }),
  }));
}

export function updateReplyLikeInProfileCache(replyId: number, liked: boolean, likesCount: number) {
  mapCachedSlices((slice) => ({
    ...slice,
    replies: slice.replies.map((r) =>
      r.id === replyId ? { ...r, is_liked: liked, likes_count: likesCount } : r,
    ),
    reposts: slice.reposts.map((item) =>
      item.kind === "reply" && item.reply?.id === replyId
        ? { ...item, reply: { ...item.reply, is_liked: liked, likes_count: likesCount } }
        : item,
    ),
  }));
}

export function updateReplyRepostInProfileCache(
  replyId: number,
  reposted: boolean,
  repostsCount: number,
) {
  mapCachedSlices((slice, tab) => {
    if (tab === "reposts" && !reposted) {
      // Карточку уберём после exit-анимации на открытой вкладке Reposts.
      return slice;
    }
    return {
      ...slice,
      replies: slice.replies.map((r) =>
        r.id === replyId ? { ...r, is_reposted: reposted, reposts_count: repostsCount } : r,
      ),
      reposts: slice.reposts.map((item) => {
        if (item.kind !== "reply" || item.reply?.id !== replyId) return item;
        return {
          ...item,
          reply: { ...item.reply, is_reposted: reposted, reposts_count: repostsCount },
        };
      }),
    };
  });
}

export function removeThemeFromProfileCache(themeId: number) {
  mapCachedSlices((slice, tab) => {
    const themes = slice.themes.filter((t) => t.id !== themeId);
    const replies = slice.replies.filter((r) => r.theme.id !== themeId);
    const reposts = slice.reposts.filter(
      (r) => !(r.kind === "theme" && r.theme?.id === themeId),
    );
    if (tab === "reposts") {
      return { ...slice, reposts };
    }
    return { ...slice, themes, replies, reposts };
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
    const reposted = profileTabsCache.slices[tab].reposts.find(
      (r) => r.kind === "theme" && r.theme?.id === themeId,
    );
    if (reposted?.theme) return reposted.theme;
  }
  return null;
}

export function findReplyInProfileCache(replyId: number): ProfileReply | null {
  if (!profileTabsCache) return null;
  for (const tab of PROFILE_TABS) {
    const hit = profileTabsCache.slices[tab].replies.find((r) => r.id === replyId);
    if (hit) return hit;
    const reposted = profileTabsCache.slices[tab].reposts.find(
      (r) => r.kind === "reply" && r.reply?.id === replyId,
    );
    if (reposted?.reply) return reposted.reply as ProfileReply;
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
    const item: ProfileRepost = {
      kind: "theme",
      reposted_at: new Date().toISOString(),
      theme: repostedTheme,
      reply: null,
    };
    const reposts = slice.reposts.some(
      (r) => r.kind === "theme" && r.theme?.id === theme.id,
    )
      ? slice.reposts.map((r) =>
          r.kind === "theme" && r.theme?.id === theme.id
            ? { ...r, theme: repostedTheme }
            : r,
        )
      : [item, ...slice.reposts];
    return { ...slice, reposts };
  });
}

/** Репост ответа с ленты/треда: добавляем во вкладку Reposts профиля. */
export function prependReplyRepostToProfileCache(reply: Reply) {
  const username = getStoredUsername();
  if (!username || !profileTabsCache || profileTabsCache.username !== username) return;

  const repostedReply = { ...reply, is_reposted: true };

  mapCachedSlices((slice, tab) => {
    if (tab !== "reposts") {
      return {
        ...slice,
        replies: slice.replies.map((r) =>
          r.id === reply.id
            ? { ...r, is_reposted: true, reposts_count: repostedReply.reposts_count }
            : r,
        ),
        reposts: slice.reposts.map((item) => {
          if (item.kind !== "reply" || item.reply?.id !== reply.id) return item;
          return { ...item, reply: repostedReply };
        }),
      };
    }
    if (!slice.loaded) return slice;
    const item: ProfileRepost = {
      kind: "reply",
      reposted_at: new Date().toISOString(),
      theme: null,
      reply: repostedReply,
    };
    const reposts = slice.reposts.some(
      (r) => r.kind === "reply" && r.reply?.id === reply.id,
    )
      ? slice.reposts.map((r) =>
          r.kind === "reply" && r.reply?.id === reply.id
            ? { ...r, reply: repostedReply }
            : r,
        )
      : [item, ...slice.reposts];
    return { ...slice, reposts };
  });
}
