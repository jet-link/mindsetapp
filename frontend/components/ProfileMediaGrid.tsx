"use client";

import { useState } from "react";
import type { MediaItem } from "@/lib/api";
import MediaLightbox from "@/components/MediaLightbox";

/** Аккуратная сетка всех изображений пользователя (темы + ответы, без тел постов). */
export default function ProfileMediaGrid({ items }: { items: MediaItem[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  return (
    <>
      <div className="media-grid">
        {items.map((m, idx) => (
          <button
            key={m.key ?? m.id}
            type="button"
            className="media-grid__item"
            onClick={() => setLightboxIndex(idx)}
            aria-label="Open image"
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

      {lightboxIndex !== null && (
        <MediaLightbox
          media={items}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
