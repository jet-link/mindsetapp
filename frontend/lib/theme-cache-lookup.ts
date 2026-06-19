import type { Reply, Theme } from "@/lib/api";
import { isLoggedIn } from "@/lib/api";
import {
  findReplyInDetailCaches,
  findReplyInThreadCaches,
  getThreadCache,
} from "@/lib/detail-cache";
import { findThemeInFeedCaches } from "@/lib/feed-cache";
import { findReplyInProfileCache, findThemeInProfileCache } from "@/lib/profile-tabs-cache";
import { findThemeInTagCaches } from "@/lib/tag-cache";

export function findThemeInAllCaches(themeId: number): Theme | null {
  const sources: Theme[] = [];
  const thread = getThreadCache(themeId)?.theme;
  if (thread) sources.push(thread);
  const feed = findThemeInFeedCaches(themeId);
  if (feed) sources.push(feed);
  const tag = findThemeInTagCaches(themeId);
  if (tag) sources.push(tag);
  const profile = findThemeInProfileCache(themeId);
  if (profile) sources.push(profile);

  if (sources.length === 0) return null;
  return mergeThemeViewerState(sources[0], ...sources.slice(1));
}

export function findReplyInAllCaches(replyId: number): Reply | null {
  const sources: Reply[] = [];
  const detail = findReplyInDetailCaches(replyId);
  if (detail) sources.push(detail);
  const thread = findReplyInThreadCaches(replyId);
  if (thread) sources.push(thread);
  const profile = findReplyInProfileCache(replyId);
  if (profile) sources.push(profile);

  if (sources.length === 0) return null;
  return mergeReplyViewerState(sources[0], ...sources.slice(1));
}

function mergeThemeViewerState(base: Theme, ...rest: Theme[]): Theme {
  let merged = base;
  for (const src of rest) {
    merged = {
      ...merged,
      is_liked: merged.is_liked || src.is_liked,
      is_reposted: merged.is_reposted || src.is_reposted,
      is_shared: merged.is_shared || src.is_shared,
      likes_count: Math.max(merged.likes_count, src.likes_count),
      reposts_count: Math.max(merged.reposts_count, src.reposts_count),
      shares_count: Math.max(merged.shares_count, src.shares_count),
    };
  }
  return merged;
}

function mergeReplyViewerState(base: Reply, ...rest: Reply[]): Reply {
  let merged = base;
  for (const src of rest) {
    merged = {
      ...merged,
      is_liked: merged.is_liked || src.is_liked,
      is_reposted: merged.is_reposted || src.is_reposted,
      likes_count: Math.max(merged.likes_count, src.likes_count),
      reposts_count: Math.max(merged.reposts_count, src.reposts_count),
    };
  }
  return merged;
}

/** Подмешивает viewer-flags из списков, если API отдал «анонимный» ответ. */
export function reconcileThemeViewerFlags(apiTheme: Theme): Theme {
  if (!isLoggedIn()) return apiTheme;
  const known = findThemeInAllCaches(apiTheme.id);
  if (!known) return apiTheme;

  const apiAnonymous =
    !apiTheme.is_liked && !apiTheme.is_reposted && !apiTheme.is_shared;
  const knownEngaged = known.is_liked || known.is_reposted || known.is_shared;
  if (!apiAnonymous || !knownEngaged) {
    return { ...apiTheme, ...pickThemeCounts(apiTheme, known) };
  }

  return {
    ...apiTheme,
    is_liked: known.is_liked,
    is_reposted: known.is_reposted,
    is_shared: known.is_shared,
    ...pickThemeCounts(apiTheme, known),
  };
}

export function reconcileReplyViewerFlags(apiReply: Reply): Reply {
  if (!isLoggedIn()) return apiReply;
  const known = findReplyInAllCaches(apiReply.id);
  if (!known) return apiReply;

  const apiAnonymous = !apiReply.is_liked && !apiReply.is_reposted;
  const knownEngaged = known.is_liked || known.is_reposted;
  if (!apiAnonymous || !knownEngaged) {
    return {
      ...apiReply,
      likes_count: Math.max(apiReply.likes_count, known.likes_count),
      reposts_count: Math.max(apiReply.reposts_count, known.reposts_count),
    };
  }

  return {
    ...apiReply,
    is_liked: known.is_liked,
    is_reposted: known.is_reposted,
    likes_count: Math.max(apiReply.likes_count, known.likes_count),
    reposts_count: Math.max(apiReply.reposts_count, known.reposts_count),
  };
}

function pickThemeCounts(apiTheme: Theme, known: Theme) {
  return {
    likes_count: Math.max(apiTheme.likes_count, known.likes_count),
    reposts_count: Math.max(apiTheme.reposts_count, known.reposts_count),
    shares_count: Math.max(apiTheme.shares_count, known.shares_count),
  };
}

export function reconcileThemeListItem(theme: Theme): Theme {
  const known = findThemeInAllCaches(theme.id);
  if (!known) return theme;
  return mergeThemeViewerState(theme, known);
}

export function reconcileReplyListItem(reply: Reply): Reply {
  const known = findReplyInAllCaches(reply.id);
  if (!known) return reply;
  return mergeReplyViewerState(reply, known);
}
