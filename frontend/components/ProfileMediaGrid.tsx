"use client";

import { useRouter } from "next/navigation";
import type { MediaItem } from "@/lib/api";
import { saveReturnAnchor } from "@/lib/return-anchor";

/** Сетка медиа профиля: клик ведёт к теме или ответу-источнику. */
export default function ProfileMediaGrid({
  username,
  items,
}: {
  username: string;
  items: MediaItem[];
}) {
  const router = useRouter();

  if (items.length === 0) return null;

  const listKey = `/u/${username}?tab=media`;

  function openSource(m: MediaItem) {
    if (m.reply_id) {
      saveReturnAnchor({ listKey, kind: "reply", id: m.reply_id });
      router.push(`/reply/${m.reply_id}`);
      return;
    }
    if (m.theme_id) {
      saveReturnAnchor({ listKey, kind: "theme", id: m.theme_id });
      router.push(`/thread/${m.theme_id}`);
    }
  }

  return (
    <div className="media-grid">
      {items.map((m) => (
        <button
          key={m.key ?? m.id}
          type="button"
          className="media-grid__item"
          onClick={() => openSource(m)}
          aria-label="Open post"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={m.thumbnail_url || m.medium_url || m.url}
            srcSet={m.srcset || undefined}
            sizes="(max-width: 620px) 33vw, 200px"
            alt=""
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );
}
