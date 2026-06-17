import type { Reply, Theme } from "@/lib/api";

type ThreadSnapshot = {
  theme: Theme;
  replies: Reply[];
};

type ReplySnapshot = {
  reply: Reply;
  children: Reply[];
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
