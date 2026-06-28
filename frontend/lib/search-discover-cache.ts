export type RecentSearch = {
  tab: "themes" | "users";
  query: string;
  at: number;
};

const RECENT_KEY_PREFIX = "mindset-search-recent";
const RECENT_MAX = 15;
const RECENT_TTL_MS = 24 * 60 * 60 * 1000;

/** Личное хранилище: только для авторизованных пользователей. */
function recentKey(owner: string): string {
  return `${RECENT_KEY_PREFIX}:${owner}`;
}

function parseRecentRaw(owner: string | null): RecentSearch[] {
  if (!owner || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(recentKey(owner));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<RecentSearch>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): RecentSearch => ({
        tab: item.tab === "users" ? "users" : "themes",
        query: typeof item.query === "string" ? item.query : "",
        at: typeof item.at === "number" ? item.at : Date.now(),
      }))
      .filter((item) => item.query.trim().length >= 2);
  } catch {
    return [];
  }
}

function writeRecentRaw(owner: string, items: RecentSearch[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(recentKey(owner), JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function readRecentSearches(owner: string | null): RecentSearch[] {
  if (!owner) return [];
  const now = Date.now();
  const raw = parseRecentRaw(owner);
  const items = raw
    .filter((item) => now - item.at < RECENT_TTL_MS)
    .slice(0, RECENT_MAX);

  const needsWrite =
    items.length !== raw.length ||
    items.some(
      (item, index) =>
        item.query !== raw[index]?.query ||
        item.tab !== raw[index]?.tab ||
        item.at !== raw[index]?.at,
    );
  if (needsWrite) writeRecentRaw(owner, items);

  return items;
}

export function pushRecentSearch(
  owner: string | null,
  tab: "themes" | "users",
  query: string,
) {
  if (!owner) return;
  const trimmed = query.trim();
  if (trimmed.length < 2) return;

  const normalized = trimmed.toLowerCase();
  const next: RecentSearch[] = [
    { tab, query: trimmed, at: Date.now() },
    ...readRecentSearches(owner).filter(
      (item) => !(item.tab === tab && item.query.toLowerCase() === normalized),
    ),
  ].slice(0, RECENT_MAX);

  writeRecentRaw(owner, next);
}

export function clearRecentSearches(owner: string | null, tab: "themes" | "users") {
  if (!owner) return;
  const now = Date.now();
  const items = parseRecentRaw(owner)
    .filter((item) => now - item.at < RECENT_TTL_MS)
    .filter((item) => item.tab !== tab);
  writeRecentRaw(owner, items);
}

export function removeRecentSearch(
  owner: string | null,
  tab: "themes" | "users",
  query: string,
) {
  if (!owner) return;
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  const normalized = trimmed.toLowerCase();
  const now = Date.now();
  const items = parseRecentRaw(owner)
    .filter((item) => now - item.at < RECENT_TTL_MS)
    .filter(
      (item) => !(item.tab === tab && item.query.toLowerCase() === normalized),
    );
  writeRecentRaw(owner, items);
}
