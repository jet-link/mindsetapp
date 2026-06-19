import type { Theme } from "@/lib/api";

export type TagSnapshot = {
  themes: Theme[];
  nextCursor: string | null;
  scrollY: number;
};

const tagCaches: Record<string, TagSnapshot> = {};

export function getTagCache(slug: string): TagSnapshot | null {
  return tagCaches[slug] ?? null;
}

export function setTagCache(slug: string, snapshot: TagSnapshot | null) {
  if (snapshot === null) {
    delete tagCaches[slug];
  } else {
    tagCaches[slug] = snapshot;
  }
}

export function updateThemeRepliesInTagCaches(themeId: number, repliesCount: number) {
  for (const slug of Object.keys(tagCaches)) {
    const cache = tagCaches[slug];
    cache.themes = cache.themes.map((t) =>
      t.id === themeId ? { ...t, replies_count: repliesCount } : t,
    );
  }
}

export function updateThemeLikeInTagCaches(themeId: number, liked: boolean, likesCount: number) {
  for (const slug of Object.keys(tagCaches)) {
    const cache = tagCaches[slug];
    cache.themes = cache.themes.map((t) =>
      t.id === themeId ? { ...t, is_liked: liked, likes_count: likesCount } : t,
    );
  }
}

export function updateThemeRepostInTagCaches(
  themeId: number,
  reposted: boolean,
  repostsCount: number,
) {
  for (const slug of Object.keys(tagCaches)) {
    const cache = tagCaches[slug];
    cache.themes = cache.themes.map((t) =>
      t.id === themeId ? { ...t, is_reposted: reposted, reposts_count: repostsCount } : t,
    );
  }
}

export function removeThemeFromTagCaches(themeId: number) {
  for (const slug of Object.keys(tagCaches)) {
    const cache = tagCaches[slug];
    cache.themes = cache.themes.filter((t) => t.id !== themeId);
  }
}

export function findThemeInTagCaches(themeId: number): Theme | null {
  for (const slug of Object.keys(tagCaches)) {
    const hit = tagCaches[slug].themes.find((t) => t.id === themeId);
    if (hit) return hit;
  }
  return null;
}
