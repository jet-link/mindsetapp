"use client";

import { useRouter } from "next/navigation";
import type { MediaItem } from "@/lib/api";
import { isGifMedia } from "@/lib/media-types";
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

  function openSource(m: MediaItem, el: HTMLElement) {
    // Якорь на саму медиакарточку + её позиция на экране — для пиксель-точного возврата.
    saveReturnAnchor({
      listKey,
      kind: "media",
      id: m.id,
      viewportTop: el.getBoundingClientRect().top,
    });
    if (m.reply_id) {
      router.push(`/reply/${m.reply_id}`);
      return;
    }
    if (m.theme_id) {
      router.push(`/thread/${m.theme_id}`);
    }
  }

  return (
    <div className="media-grid">
      {items.map((m) => {
        const animated = isGifMedia(m);
        return (
        <button
          key={m.key ?? m.id}
          type="button"
          className="media-grid__item"
          data-anchor-media={m.id}
          onClick={(e) => openSource(m, e.currentTarget)}
          aria-label="Open post"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={animated ? m.url : (m.thumbnail_url || m.medium_url || m.url)}
            srcSet={animated ? undefined : (m.srcset || undefined)}
            sizes="(max-width: 620px) 33vw, 200px"
            alt=""
            loading="lazy"
          />
        </button>
        );
      })}
    </div>
  );
}
