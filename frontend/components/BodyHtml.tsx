import { memo } from "react";

/** Изолированный рендер HTML-тела: не перерисовывается при like/repost и т.п. */
const BodyHtml = memo(function BodyHtml({ html }: { html: string }) {
  return <div className="body-html" dangerouslySetInnerHTML={{ __html: html }} />;
});

export default BodyHtml;
