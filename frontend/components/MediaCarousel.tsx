"use client";

import { useState } from "react";
import type { MediaItem } from "@/lib/api";
import { isGifMedia } from "@/lib/media-types";
import MediaLightbox from "@/components/MediaLightbox";

function aspectStyle(m: MediaItem): React.CSSProperties {
  if (m.width && m.height) {
    return { aspectRatio: `${m.width} / ${m.height}` };
  }
  return {};
}

function isWideSingleImage(m: MediaItem): boolean {
  if (m.width && m.height) {
    return m.width > m.height;
  }
  return m.orientation_kind === "wide" || m.orientation_kind === "landscape";
}

function MediaThumb({
  media: m,
  onOpen,
  wide,
}: {
  media: MediaItem;
  onOpen: () => void;
  wide?: boolean;
}) {
  const animated = isGifMedia(m);
  const src = animated ? m.url : (m.medium_url || m.url);
  const srcSet = animated ? undefined : (m.srcset || undefined);

  return (
    <button
      type="button"
      className={`media-thumb media-thumb--image${wide ? " media-thumb--wide" : ""}`}
      style={aspectStyle(m)}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={animated ? "Open GIF" : "Open image"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        srcSet={srcSet}
        sizes={wide ? "100vw" : "(max-width: 620px) 70vw, 360px"}
        alt=""
      />
    </button>
  );
}

export default function MediaCarousel({ media }: { media: MediaItem[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (media.length === 0) return null;

  const lightboxOpen = lightboxIndex !== null;

  if (media.length === 1) {
    const single = media[0];
    const wide = isWideSingleImage(single);
    return (
      <>
        <div
          className={`card-media card-media--single${
            wide ? " card-media--wide" : " card-media--portrait"
          }`}
        >
          <MediaThumb
            media={single}
            wide={wide}
            onOpen={() => setLightboxIndex(0)}
          />
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

  return (
    <>
      <div className="card-media">
        {media.map((m, idx) => (
          <MediaThumb
            key={m.id}
            media={m}
            onOpen={() => setLightboxIndex(idx)}
          />
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
