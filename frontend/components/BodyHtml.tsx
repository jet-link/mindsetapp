import { memo, useMemo } from "react";

const YT_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; compute-pressure";

/** Старые посты могли сохраниться без compute-pressure в allow — YouTube тогда шумит в консоли. */
function patchYoutubeIframeAllow(html: string): string {
  if (!html.includes("youtube.com/embed")) return html;
  return html.replace(
    /<iframe\b([^>]*\bsrc="https:\/\/(?:www\.)?youtube\.com\/embed\/[^"]+"[^>]*)>/gi,
    (tag, attrs: string) => {
      if (/compute-pressure/i.test(attrs)) return tag;
      if (/allow="/i.test(attrs)) {
        return `<iframe${attrs.replace(
          /allow="([^"]*)"/i,
          (_, allow: string) => `allow="${allow}; compute-pressure"`,
        )}>`;
      }
      return `<iframe${attrs} allow="${YT_IFRAME_ALLOW}">`;
    },
  );
}

/** Изолированный рендер HTML-тела: не перерисовывается при like/repost и т.п. */
const BodyHtml = memo(function BodyHtml({ html }: { html: string }) {
  const safeHtml = useMemo(() => patchYoutubeIframeAllow(html), [html]);
  return <div className="body-html" dangerouslySetInnerHTML={{ __html: safeHtml }} />;
});

export default BodyHtml;
