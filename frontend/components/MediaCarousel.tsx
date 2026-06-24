"use client";

import { useState } from "react";
import type { MediaItem } from "@/lib/api";
import MediaLightbox from "@/components/MediaLightbox";

function aspectStyle(m: MediaItem): React.CSSProperties {
  if (m.width && m.height) {
    return { aspectRatio: `${m.width} / ${m.height}` };
  }
  return {};
}

export default function MediaCarousel({ media }: { media: MediaItem[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (media.length === 0) return null;

  const lightboxOpen = lightboxIndex !== null;

  return (
    <>
      <div className="card-media">
        {media.map((m, idx) => (
          <button
            key={m.id}
            type="button"
            className="media-thumb media-thumb--image"
            style={aspectStyle(m)}
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex(idx);
            }}
            aria-label="Open image"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.medium_url || m.url}
              srcSet={m.srcset || undefined}
              sizes="(max-width: 620px) 70vw, 360px"
              alt=""
            />
          </button>
        ))}
      </div>

      {lightboxOpen && (
        <MediaLightbox
          media={media}
          startIndex={lightboxIndex as number}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
