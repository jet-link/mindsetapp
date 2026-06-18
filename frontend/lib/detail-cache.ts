import type { Reply, Theme } from "@/lib/api";

type ThreadSnapshot = {
  theme: Theme;
  replies: Reply[];
};

type ReplySnapshot = {
  reply: Reply;
  children: Reply[];
};

export type ReplyCreatedPayload = {
  themeId: number;
  parentId: number | null;
  reply: Reply;
  themeRepliesCount: number;
  parentRepliesCount?: number;
};

const threadCaches = new Map<number, ThreadSnapshot>();
const replyCaches = new Map<number, ReplySnapshot>();

export function getThreadCache(id: number): ThreadSnapshot | null {
  return threadCaches.get(id) ?? null;
}

export function setThreadCache(id: number, snapshot: ThreadSnapshot) {
  threadCaches.set(id, snapshot);
}

export function getReplyDetailCache(id: number): ReplySnapshot | null {
  return replyCaches.get(id) ?? null;
}

export function setReplyDetailCache(id: number, snapshot: ReplySnapshot) {
  replyCaches.set(id, snapshot);
}

export function applyReplyCreated(detail: ReplyCreatedPayload) {
  const { themeId, parentId, reply, themeRepliesCount, parentRepliesCount } = detail;

  const threadSnap = threadCaches.get(themeId);
  if (threadSnap) {
    const theme = { ...threadSnap.theme, replies_count: themeRepliesCount };
    let replies = threadSnap.replies;
    if (parentId === null) {
      if (!replies.some((r) => r.id === reply.id)) {
        replies = [reply, ...replies];
      }
    } else if (parentRepliesCount !== undefined) {
      replies = replies.map((r) =>
        r.id === parentId ? { ...r, replies_count: parentRepliesCount } : r,
      );
    }
    threadCaches.set(themeId, { theme, replies });
  }

  if (parentId !== null && parentRepliesCount !== undefined) {
    const parentSnap = replyCaches.get(parentId);
    if (parentSnap) {
      const children = parentSnap.children.some((c) => c.id === reply.id)
        ? parentSnap.children
        : [reply, ...parentSnap.children];
      replyCaches.set(parentId, {
        reply: { ...parentSnap.reply, replies_count: parentRepliesCount },
        children,
      });
    }
  }
}

function patchReplyInCaches(
  replyId: number,
  patch: Partial<Pick<Reply, "is_liked" | "likes_count" | "is_reposted" | "reposts_count">>,
) {
  for (const [threadId, snap] of threadCaches) {
    let changed = false;
    const replies = snap.replies.map((r) => {
      if (r.id !== replyId) return r;
      changed = true;
      return { ...r, ...patch };
    });
    if (changed) threadCaches.set(threadId, { ...snap, replies });
  }

  for (const [cacheId, snap] of replyCaches) {
    const reply = snap.reply.id === replyId ? { ...snap.reply, ...patch } : snap.reply;
    const children = snap.children.map((r) => (r.id === replyId ? { ...r, ...patch } : r));
    const changed =
      reply !== snap.reply || children.some((r, i) => r !== snap.children[i]);
    if (changed) replyCaches.set(cacheId, { reply, children });
  }
}

export function applyThemeLikeChanged(themeId: number, liked: boolean, likesCount: number) {
  const snap = threadCaches.get(themeId);
  if (snap) {
    threadCaches.set(themeId, {
      ...snap,
      theme: { ...snap.theme, is_liked: liked, likes_count: likesCount },
    });
  }
}

export function applyThemeRepostChanged(
  themeId: number,
  reposted: boolean,
  repostsCount: number,
) {
  const snap = threadCaches.get(themeId);
  if (snap) {
    threadCaches.set(themeId, {
      ...snap,
      theme: { ...snap.theme, is_reposted: reposted, reposts_count: repostsCount },
    });
  }
}

export function applyReplyLikeChanged(replyId: number, liked: boolean, likesCount: number) {
  patchReplyInCaches(replyId, { is_liked: liked, likes_count: likesCount });
}

export function applyReplyRepostChanged(replyId: number, reposted: boolean, repostsCount: number) {
  patchReplyInCaches(replyId, { is_reposted: reposted, reposts_count: repostsCount });
}
