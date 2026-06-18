// Тонкий клиент к Mindset API. Типы потом сгенерируем из OpenAPI-схемы
// (drf-spectacular: /api/schema/), пока описаны вручную.

import {
  applyReplyCreated,
  applyReplyLikeChanged,
  applyReplyRepostChanged,
  applyThemeLikeChanged,
  applyThemeRepostChanged,
} from "./detail-cache";
import {
  prependThemeToFeedCache,
  updateAuthorAvatarInFeedCache,
  updateThemeRepliesInFeedCache,
  updateThemeLikeInFeedCache,
  updateThemeRepostInFeedCache,
  removeAuthorFromFollowingFeedCache,
  clearFeedCache,
} from "./feed-cache";
import {
  clearProfileTabsCache,
  updateThemeLikeInProfileCache,
  updateThemeRepostInProfileCache,
  updateThemeRepliesInProfileCache,
  updateReplyLikeInProfileCache,
  updateReplyRepostInProfileCache,
} from "./profile-tabs-cache";
import {
  updateThemeRepliesInTagCaches,
  updateThemeLikeInTagCaches,
  updateThemeRepostInTagCaches,
} from "./tag-cache";
import { setUserAvatarOverride } from "./user-avatar-store";

export interface UserPublic {
  id: number;
  username: string;
  avatar: string | null;
  bio: string;
  is_following?: boolean;
}

export interface UserProfile extends UserPublic {
  followers_count: number;
  following_count: number;
  themes_count: number;
  replies_count: number;
  media_count: number;
  reposts_count: number;
  date_joined: string;
  is_following: boolean;
}

export interface ThemeImage {
  id: number;
  url: string;
  thumbnail_url: string;
  medium_url: string;
  srcset: string;
  width: number | null;
  height: number | null;
  orientation_kind: string;
  sort_order: number;
}

export interface Hashtag {
  name: string;
  slug: string;
  themes_count: number;
}

export interface Theme {
  id: number;
  author: UserPublic;
  body: string;
  body_text: string;
  preview: string;
  images: ThemeImage[];
  hashtags: Hashtag[];
  replies_count: number;
  likes_count: number;
  reposts_count: number;
  shares_count: number;
  is_liked: boolean;
  is_reposted: boolean;
  is_shared: boolean;
  created_at: string;
  human_published: string;
  is_editable: boolean;
}

export interface Reply {
  id: number;
  theme_id: number;
  parent_id: number | null;
  author: UserPublic;
  body: string;
  replies_count: number;
  likes_count: number;
  reposts_count: number;
  is_liked: boolean;
  is_reposted: boolean;
  created_at: string;
  human_published: string;
}

export interface ProfileReply extends Reply {
  theme: Theme;
}

export interface CursorPage<T> {
  next: string | null;
  previous: string | null;
  results: T[];
}

const isServer = typeof window === "undefined";

function apiBase(): string {
  // На сервере (SSR) ходим напрямую в Django, в браузере — через rewrite-прокси.
  return isServer ? process.env.API_ORIGIN ?? "http://127.0.0.1:8000" : "";
}

// --- Хранилище токенов: "Remember me" ---
// remember=true  -> localStorage  (сессия живёт после перезапуска браузера)
// remember=false -> sessionStorage (очищается при закрытии вкладки/браузера)
const ACCESS_KEY = "mindset_access";
const REFRESH_KEY = "mindset_refresh";
const USERNAME_KEY = "mindset_username";
const REMEMBER_KEY = "mindset_remember";
const TOKEN_KEYS = [ACCESS_KEY, REFRESH_KEY, USERNAME_KEY];

function preferredStore(): Storage {
  // Флаг предпочтения держим в localStorage, чтобы он переживал перезапуск.
  return localStorage.getItem(REMEMBER_KEY) === "0" ? sessionStorage : localStorage;
}

function readStored(key: string): string | null {
  if (isServer) return null;
  // Читаем из обоих хранилищ — токен мог попасть в любое из них.
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

function writeStored(key: string, value: string) {
  if (isServer) return;
  preferredStore().setItem(key, value);
}

function clearStored() {
  if (isServer) return;
  for (const key of TOKEN_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
  localStorage.removeItem(REMEMBER_KEY);
}

/** Имя текущего пользователя из активного хранилища (или null). */
export function getStoredUsername(): string | null {
  return readStored(USERNAME_KEY);
}

function authHeaders(): Record<string, string> {
  if (isServer) return {};
  const token = readStored(ACCESS_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function humanizeApiError(status: number, rawBody: string): string {
  // DRF отдает JSON с деталями; HTML-страницы ошибок Django не показываем.
  try {
    const data = JSON.parse(rawBody);
    if (typeof data.detail === "string") return data.detail;
    // Ошибки валидации вида {"field": ["msg", ...]}
    const parts: string[] = [];
    for (const [field, msgs] of Object.entries(data)) {
      const text = Array.isArray(msgs) ? msgs.join(" ") : String(msgs);
      parts.push(field === "non_field_errors" ? text : `${field}: ${text}`);
    }
    if (parts.length) return parts.join("\n");
  } catch {
    // не JSON — отдаем общее сообщение ниже
  }
  if (status === 401) return "You need to log in.";
  if (status === 403) return "You don't have permission to do that.";
  return `Server error (${status}). Please try again.`;
}

// Один общий refresh на все параллельные запросы, чтобы не дергать
// /token/refresh/ многократно при пачке одновременных 401.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (isServer) return false;
  const refresh = readStored(REFRESH_KEY);
  if (!refresh) return false;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/v1/auth/token/refresh/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh }),
          cache: "no-store",
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { access?: string; refresh?: string };
        if (data.access) writeStored(ACCESS_KEY, data.access);
        // ROTATE_REFRESH_TOKENS=True — сохраняем новый refresh-токен
        if (data.refresh) writeStored(REFRESH_KEY, data.refresh);
        return !!data.access;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

function accessTokenExpired(): boolean {
  if (isServer) return false;
  const token = readStored(ACCESS_KEY);
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as { exp?: number };
    if (!payload.exp) return true;
    return payload.exp * 1000 < Date.now() + 10_000;
  } catch {
    return true;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  // Не отправляем протухший access-токен — иначе публичные GET
  // получают 401 и сыпятся ошибки в консоль.
  if (!isServer && !path.includes("/auth/token") && accessTokenExpired()) {
    await refreshAccessToken();
  }

  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...init.headers,
    },
    cache: "no-store",
  });

  const isAuthCall = path.includes("/auth/token");
  if (res.status === 401 && retry && !isServer && !isAuthCall) {
    const ok = await refreshAccessToken();
    if (ok) return apiFetch<T>(path, init, false);
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "GET") {
      const anon = await fetch(`${apiBase()}${path}`, {
        ...init,
        method,
        headers: { "Content-Type": "application/json", ...init.headers },
        cache: "no-store",
        signal: init.signal,
      });
      if (anon.ok) return anon.json() as Promise<T>;
    }
    forceLogoutRedirect();
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(humanizeApiError(res.status, body));
  }
  return res.json() as Promise<T>;
}

/** Есть ли сохраненный JWT (только в браузере). */
export function isLoggedIn(): boolean {
  return typeof window !== "undefined" && !!readStored(ACCESS_KEY);
}

export function logout() {
  clearStored();
  clearFeedCache();
  clearProfileTabsCache();
  emitAuthChanged();
}

/** Принудительный выход (протухшая сессия): чистим токены и уводим на /login. */
function forceLogoutRedirect() {
  logout();
  if (!isServer && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

// --- Auth ---
// Событие для компонентов (например, шапки), реагирующих на вход/выход
// без перезагрузки страницы.
export const AUTH_EVENT = "mindset-auth";

function emitAuthChanged() {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export type LoginErrorCode = "user_not_found" | "password_incorrect";

export class LoginError extends Error {
  code: LoginErrorCode;

  constructor(code: LoginErrorCode, message: string) {
    super(message);
    this.name = "LoginError";
    this.code = code;
  }
}

export async function login(username: string, password: string, remember = true) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });

  const data = (await res.json()) as {
    ok?: boolean;
    access?: string;
    refresh?: string;
    code?: LoginErrorCode;
    message?: string;
  };

  if (!res.ok || !data.ok || !data.access || !data.refresh) {
    const code = data.code ?? "user_not_found";
    const message = data.message ?? (code === "password_incorrect" ? "Password incorrectly" : "User not found");
    throw new LoginError(code, message);
  }

  // Сначала фиксируем предпочтение, затем пишем токены в нужное хранилище.
  localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  writeStored(ACCESS_KEY, data.access);
  writeStored(REFRESH_KEY, data.refresh);
  writeStored(USERNAME_KEY, username);
  clearFeedCache();
  clearProfileTabsCache();
  emitAuthChanged();
  return { access: data.access, refresh: data.refresh };
}

export interface RegisterFieldErrors {
  username?: string;
  email?: string;
  password?: string;
}

export class RegisterError extends Error {
  fields: RegisterFieldErrors;

  constructor(fields: RegisterFieldErrors) {
    super("Registration failed");
    this.name = "RegisterError";
    this.fields = fields;
  }
}

export async function register(username: string, email: string, password: string) {
  // Бэкенд отдаёт 200 с {ok:false, errors} при невалидных полях (без 400 в консоли).
  const data = await apiFetch<{ ok?: boolean; errors?: RegisterFieldErrors }>(
    "/api/v1/auth/register/",
    {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    },
  );
  if (data && data.ok === false) {
    throw new RegisterError(data.errors ?? {});
  }
  return data;
}

// --- Feed / Themes ---
export type FeedTab = "main" | "my" | "for-you" | "following" | "liked";

export const getFeed = (
  tab: FeedTab,
  cursor?: string,
  q?: string,
  signal?: AbortSignal,
) =>
  apiFetch<CursorPage<Theme>>(
    `/api/v1/feed/?tab=${tab}` +
      `${q ? `&q=${encodeURIComponent(q)}` : ""}` +
      `${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    { signal },
  );

export const getThread = (id: number | string) =>
  apiFetch<{ theme: Theme; replies: Reply[] }>(`/api/v1/themes/${id}/`);

export const getReplyDetail = (id: number | string) =>
  apiFetch<{ reply: Reply; replies: Reply[] }>(`/api/v1/replies/${id}/`);

interface CooldownPayload {
  cooldown?: boolean;
  retry_after?: number;
  detail?: string;
}

// Сервер отдаёт кулдаун как 200 {cooldown:true,...} (чтобы браузер не сыпал 429
// в консоль). Превращаем это в ошибку — её ловят формы и показывают отсчёт.
function throwIfCooldown(data: unknown) {
  const d = data as CooldownPayload | null;
  if (d && d.cooldown) {
    throw new Error(
      d.detail ?? `You're posting too fast. Try again in ${d.retry_after ?? 0} seconds.`,
    );
  }
}

export const createTheme = async (body: string) => {
  const data = await apiFetch<Theme | CooldownPayload>("/api/v1/themes/", {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  throwIfCooldown(data);
  return data as Theme;
};

export const toggleLike = (themeId: number) =>
  apiFetch<{ liked: boolean; likes_count: number }>(
    `/api/v1/themes/${themeId}/like/`, { method: "POST" });

export const toggleRepost = (themeId: number) =>
  apiFetch<{ reposted: boolean; reposts_count: number }>(
    `/api/v1/themes/${themeId}/repost/`, { method: "POST" });

export const shareTheme = (themeId: number) =>
  apiFetch<{ shared: boolean; shares_count: number }>(
    `/api/v1/themes/${themeId}/share/`, { method: "POST" });

export interface CreateReplyResponse extends Reply {
  theme_replies_count: number;
  parent_replies_count?: number;
}

export const createReply = async (themeId: number, body: string, parentId?: number) => {
  const data = await apiFetch<CreateReplyResponse | CooldownPayload>(
    `/api/v1/themes/${themeId}/replies/`,
    {
      method: "POST",
      body: JSON.stringify({ body, parent_id: parentId ?? null }),
    },
  );
  throwIfCooldown(data);
  return data as CreateReplyResponse;
};

export const toggleReplyLike = (replyId: number) =>
  apiFetch<{ liked: boolean; likes_count: number }>(
    `/api/v1/replies/${replyId}/like/`, { method: "POST" });

export const toggleReplyRepost = (replyId: number) =>
  apiFetch<{ reposted: boolean; reposts_count: number }>(
    `/api/v1/replies/${replyId}/repost/`, { method: "POST" });

// --- Users / Tags ---
export const getProfile = (username: string) =>
  apiFetch<UserProfile>(`/api/v1/users/${encodeURIComponent(username)}/`);

export const getUserThemes = (username: string, cursor?: string) =>
  apiFetch<CursorPage<Theme>>(
    `/api/v1/users/${encodeURIComponent(username)}/themes/${buildQuery({ cursor })}`,
  );

export const getUserReposts = (username: string, cursor?: string) =>
  apiFetch<CursorPage<Theme>>(
    `/api/v1/users/${encodeURIComponent(username)}/reposts/${buildQuery({ cursor })}`,
  );

export const getUserReplies = (username: string, cursor?: string) =>
  apiFetch<CursorPage<ProfileReply>>(
    `/api/v1/users/${encodeURIComponent(username)}/replies/${buildQuery({ cursor })}`,
  );

export const getUserMedia = (username: string, cursor?: string) =>
  apiFetch<CursorPage<Theme>>(
    `/api/v1/users/${encodeURIComponent(username)}/media/${buildQuery({ cursor })}`,
  );

/**
 * Счетчики под темами: до 9999 — как есть, дальше 10k, 11k … 999k, 1m …
 */
export function formatCount(n: number): string {
  if (n < 10_000) return String(n);
  if (n < 1_000_000) return `${Math.floor(n / 1_000)}k`;
  if (n < 1_000_000_000) return `${Math.floor(n / 1_000_000)}m`;
  return `${Math.floor(n / 1_000_000_000)}b`;
}

export const toggleFollow = (username: string) =>
  apiFetch<{ following: boolean; followers_count: number; following_count: number }>(
    `/api/v1/users/${encodeURIComponent(username)}/follow/`, { method: "POST" });

// Событие для мгновенного обновления счетчиков подписчиков на открытых
// страницах профиля без перезагрузки.
export const FOLLOW_EVENT = "mindset-follow";

export interface FollowChangedDetail {
  profileUsername: string;
  following?: boolean;
  followers_count?: number;
  viewerUsername?: string;
  viewer_following_count?: number;
}

export function emitFollowChanged(detail: FollowChangedDetail) {
  if (typeof window !== "undefined") {
    if (detail.following === false) {
      removeAuthorFromFollowingFeedCache(detail.profileUsername);
    }
    window.dispatchEvent(new CustomEvent(FOLLOW_EVENT, { detail }));
  }
}

export const getFollowers = (username: string, cursor?: string, q?: string) =>
  apiFetch<CursorPage<UserPublic>>(
    `/api/v1/users/${encodeURIComponent(username)}/followers/` +
      buildQuery({ cursor, q }),
  );

export const getFollowing = (username: string, cursor?: string, q?: string) =>
  apiFetch<CursorPage<UserPublic>>(
    `/api/v1/users/${encodeURIComponent(username)}/following/` +
      buildQuery({ cursor, q }),
  );

function buildQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

// --- Notifications ---
export interface NotificationItem {
  id: number;
  actor: UserPublic;
  verb: "reply" | "repost";
  theme_id: number | null;
  reply_id: number | null;
  reply_parent_id: number | null;
  is_read: boolean;
  created_at: string;
}

export const NOTIFICATION_EVENT = "mindset-notifications";

export function emitNotificationsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NOTIFICATION_EVENT));
  }
}

export const getNotifications = (cursor?: string) =>
  apiFetch<CursorPage<NotificationItem>>(
    `/api/v1/notifications/${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );

export const getUnreadNotificationsCount = () =>
  apiFetch<{ unread_count: number }>("/api/v1/notifications/unread/");

export const markAllNotificationsRead = () =>
  apiFetch<{ marked_read: number }>("/api/v1/notifications/read/", { method: "POST" });

export const clearNotifications = () =>
  apiFetch<{ deleted: number }>("/api/v1/notifications/clear/", { method: "POST" });

// --- Search ---
export const searchUsers = (q: string, cursor?: string, signal?: AbortSignal) =>
  apiFetch<CursorPage<UserPublic>>(
    `/api/v1/users/search/${buildQuery({ q, cursor })}`,
    { signal },
  );

export const searchMentionUsers = (q: string, signal?: AbortSignal) =>
  apiFetch<CursorPage<UserPublic>>(
    `/api/v1/users/search/${buildQuery({ q, username_only: "1" })}`,
    { signal },
  );

export const getPopularSearches = () =>
  apiFetch<{ themes: string[]; users: string[] }>("/api/v1/search/popular/");

export const getTagThemes = (slug: string, cursor?: string) =>
  apiFetch<CursorPage<Theme>>(
    `/api/v1/tags/${encodeURIComponent(slug)}/themes/${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );

// --- Me (profile edit) ---
export interface MeProfile {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  bio: string;
  followers_count: number;
  following_count: number;
  themes_count: number;
}

export const getMe = () => apiFetch<MeProfile>("/api/v1/me/");

export const updateMeBio = (bio: string) =>
  apiFetch<MeProfile>("/api/v1/me/", { method: "PATCH", body: JSON.stringify({ bio }) });

async function apiFetchMultipart<T>(path: string, formData: FormData, retry = true): Promise<T> {
  if (!isServer && accessTokenExpired()) {
    await refreshAccessToken();
  }

  const res = await fetch(`${apiBase()}${path}`, {
    method: "PATCH",
    headers: { ...authHeaders() },
    body: formData,
    cache: "no-store",
  });

  if (res.status === 401 && retry && !isServer) {
    const ok = await refreshAccessToken();
    if (ok) return apiFetchMultipart<T>(path, formData, false);
    forceLogoutRedirect();
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(humanizeApiError(res.status, body));
  }
  return res.json() as Promise<T>;
}

export const updateMeAvatar = (file: File) => {
  const formData = new FormData();
  formData.append("avatar", file);
  return apiFetchMultipart<MeProfile>("/api/v1/me/", formData);
};

export const deleteMeAvatar = () =>
  apiFetch<MeProfile>("/api/v1/me/", { method: "PATCH", body: JSON.stringify({ avatar: null }) });

export const USER_PROFILE_EVENT = "mindset-user-profile";

export interface UserProfileUpdatedDetail {
  username: string;
  avatar?: string | null;
  bio?: string;
}

export function emitUserProfileUpdated(detail: UserProfileUpdatedDetail) {
  if (typeof window !== "undefined") {
    if (detail.avatar !== undefined) {
      setUserAvatarOverride(detail.username, detail.avatar);
      updateAuthorAvatarInFeedCache(detail.username, detail.avatar);
    }
    window.dispatchEvent(new CustomEvent(USER_PROFILE_EVENT, { detail }));
  }
}

// Мгновенное обновление ленты и счётчиков без перезагрузки страницы.
export const THEME_CREATED_EVENT = "mindset-theme-created";

export function emitThemeCreated(theme: Theme) {
  prependThemeToFeedCache(theme);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_CREATED_EVENT, { detail: theme }));
  }
}

export const REPLY_CREATED_EVENT = "mindset-reply-created";

export interface ReplyCreatedDetail {
  themeId: number;
  parentId: number | null;
  reply: Reply;
  themeRepliesCount: number;
  parentRepliesCount?: number;
}

export function emitReplyCreated(detail: ReplyCreatedDetail) {
  updateThemeRepliesInFeedCache(detail.themeId, detail.themeRepliesCount);
  updateThemeRepliesInTagCaches(detail.themeId, detail.themeRepliesCount);
  updateThemeRepliesInProfileCache(
    detail.themeId,
    detail.themeRepliesCount,
    detail.parentId,
    detail.parentRepliesCount,
  );
  applyReplyCreated(detail);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REPLY_CREATED_EVENT, { detail }));
  }
}

export const THEME_LIKE_EVENT = "mindset-theme-like";

export interface ThemeLikeDetail {
  themeId: number;
  liked: boolean;
  likes_count: number;
}

export function emitThemeLikeChanged(detail: ThemeLikeDetail) {
  updateThemeLikeInFeedCache(detail.themeId, detail.liked, detail.likes_count);
  updateThemeLikeInTagCaches(detail.themeId, detail.liked, detail.likes_count);
  updateThemeLikeInProfileCache(detail.themeId, detail.liked, detail.likes_count);
  applyThemeLikeChanged(detail.themeId, detail.liked, detail.likes_count);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_LIKE_EVENT, { detail }));
  }
}

export const THEME_REPOST_EVENT = "mindset-theme-repost";

export interface ThemeRepostDetail {
  themeId: number;
  reposted: boolean;
  reposts_count: number;
}

export function emitThemeRepostChanged(detail: ThemeRepostDetail) {
  updateThemeRepostInFeedCache(detail.themeId, detail.reposted, detail.reposts_count);
  updateThemeRepostInTagCaches(detail.themeId, detail.reposted, detail.reposts_count);
  updateThemeRepostInProfileCache(detail.themeId, detail.reposted, detail.reposts_count);
  applyThemeRepostChanged(detail.themeId, detail.reposted, detail.reposts_count);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_REPOST_EVENT, { detail }));
  }
}

export const REPLY_LIKE_EVENT = "mindset-reply-like";

export interface ReplyLikeDetail {
  replyId: number;
  liked: boolean;
  likes_count: number;
}

export function emitReplyLikeChanged(detail: ReplyLikeDetail) {
  updateReplyLikeInProfileCache(detail.replyId, detail.liked, detail.likes_count);
  applyReplyLikeChanged(detail.replyId, detail.liked, detail.likes_count);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REPLY_LIKE_EVENT, { detail }));
  }
}

export const REPLY_REPOST_EVENT = "mindset-reply-repost";

export interface ReplyRepostDetail {
  replyId: number;
  reposted: boolean;
  reposts_count: number;
}

export function emitReplyRepostChanged(detail: ReplyRepostDetail) {
  updateReplyRepostInProfileCache(detail.replyId, detail.reposted, detail.reposts_count);
  applyReplyRepostChanged(detail.replyId, detail.reposted, detail.reposts_count);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REPLY_REPOST_EVENT, { detail }));
  }
}
