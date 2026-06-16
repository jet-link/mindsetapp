import type { Reply, Theme, UserPublic } from "@/lib/api";

const avatarOverrides = new Map<string, string | null>();

export function setUserAvatarOverride(username: string, avatar: string | null) {
  avatarOverrides.set(username, avatar);
}

export function getUserAvatarOverride(username: string): string | null | undefined {
  return avatarOverrides.get(username);
}

export function resolveUserAvatar(username: string, fallback?: string | null): string | null {
  if (avatarOverrides.has(username)) {
    return avatarOverrides.get(username) ?? null;
  }
  return fallback ?? null;
}

export function patchThemeAuthors(
  themes: Theme[],
  username: string,
  avatar: string | null,
): Theme[] {
  return themes.map((t) =>
    t.author.username === username
      ? { ...t, author: { ...t.author, avatar } }
      : t,
  );
}

export function patchReplyAuthors(
  replies: Reply[],
  username: string,
  avatar: string | null,
): Reply[] {
  return replies.map((r) =>
    r.author.username === username
      ? { ...r, author: { ...r.author, avatar } }
      : r,
  );
}

export function patchUserPublicList(
  users: UserPublic[],
  username: string,
  avatar: string | null,
): UserPublic[] {
  return users.map((u) => (u.username === username ? { ...u, avatar } : u));
}

export function patchNotificationActors<
  T extends { actor: { username: string; avatar: string | null } },
>(items: T[], username: string, avatar: string | null): T[] {
  return items.map((item) =>
    item.actor.username === username
      ? { ...item, actor: { ...item.actor, avatar } }
      : item,
  );
}
