const DISCOVER_STORAGE_KEY = "mindset-search-discover";
const POPULAR_STORAGE_KEY = "mindset-search-popular-queries";
const TTL_MS = 15 * 60 * 1000;

type CachedPayload<T> = {
  cachedAt: number;
  data: T;
};

export type DiscoverPayload = {
  mode: "popular" | "trending";
  themes: string[];
  users: string[];
  cached_until?: string;
};

export type PopularQueriesPayload = {
  themes: string[];
  users: string[];
  cached_until?: string;
};

function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload<T>;
    if (Date.now() - parsed.cachedAt > TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedPayload<T> = { cachedAt: Date.now(), data };
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}

export function readDiscoverCache(mode: "popular" | "trending"): DiscoverPayload | null {
  return readCache<DiscoverPayload>(`${DISCOVER_STORAGE_KEY}:${mode}`);
}

export function writeDiscoverCache(data: DiscoverPayload) {
  writeCache(`${DISCOVER_STORAGE_KEY}:${data.mode}`, data);
}

export function readPopularQueriesCache(): PopularQueriesPayload | null {
  return readCache<PopularQueriesPayload>(POPULAR_STORAGE_KEY);
}

export function writePopularQueriesCache(data: PopularQueriesPayload) {
  writeCache(POPULAR_STORAGE_KEY, data);
}

const RECENT_KEY = "mindset-search-recent";
const RECENT_MAX = 8;

export type RecentSearch = { tab: "themes" | "users"; query: string };

export function readRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentSearch[];
  } catch {
    return [];
  }
}

export function pushRecentSearch(tab: "themes" | "users", query: string) {
  if (typeof window === "undefined") return;
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  const normalized = trimmed.toLowerCase();
  const next: RecentSearch[] = [
    { tab, query: trimmed },
    ...readRecentSearches().filter(
      (r) => !(r.tab === tab && r.query.toLowerCase() === normalized),
    ),
  ].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
