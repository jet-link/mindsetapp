import type { Reply } from "@/lib/api";

export type ReplySort = "newest" | "popular";

// Возвращает новый отсортированный массив, не мутируя исходный.
// newest — сначала свежие (по created_at), popular — сначала залайканные.
export function sortReplies<T extends Reply>(replies: T[], sort: ReplySort): T[] {
  const copy = [...replies];
  if (sort === "popular") {
    copy.sort((a, b) => {
      if (b.likes_count !== a.likes_count) return b.likes_count - a.likes_count;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  } else {
    copy.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }
  return copy;
}
