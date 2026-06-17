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
