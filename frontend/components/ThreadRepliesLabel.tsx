"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReplySort } from "@/lib/reply-sort";

export default function ThreadRepliesLabel({
  sort,
  onSortChange,
  showSort = true,
}: {
  sort: ReplySort;
  onSortChange: (sort: ReplySort) => void;
  showSort?: boolean;
}) {
  const { t } = useTranslation("feed");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function select(next: ReplySort) {
    onSortChange(next);
    setOpen(false);
  }

  return (
    <div className="thread-replies-label">
      <div className="thread-replies-label__line-col" aria-hidden="true">
        <span className="thread-replies-label__line" />
      </div>
      <div className="thread-replies-label__main">
        <p className="thread-replies-label__text">
          <span className="thread-replies-label__text-content">{t("replies")}</span>
        </p>
        {showSort && (
          <div
            className={`card-menu replies-sort${open ? " card-menu--open replies-sort--open" : ""}`}
            ref={rootRef}
          >
            <button
              type="button"
              className="replies-sort__trigger"
              aria-label={t("sortReplies")}
              title={t("sortReplies")}
              aria-expanded={open}
              aria-haspopup="menu"
              onClick={() => setOpen((v) => !v)}
            >
              <i
                className={`fa-solid ${open ? "fa-angle-up" : "fa-angle-down"}`}
                aria-hidden="true"
              />
            </button>

            <div className="card-menu__panel replies-sort__panel" role="menu" inert={!open}>
              <button
                type="button"
                className={`card-menu__item${sort === "newest" ? " card-menu__item--active" : ""}`}
                role="menuitemradio"
                aria-checked={sort === "newest"}
                tabIndex={open ? 0 : -1}
                onClick={() => select("newest")}
              >
                <i className="fa-solid fa-clock" aria-hidden="true" />
                {t("sortNewest")}
              </button>
              <button
                type="button"
                className={`card-menu__item${sort === "popular" ? " card-menu__item--active" : ""}`}
                role="menuitemradio"
                aria-checked={sort === "popular"}
                tabIndex={open ? 0 : -1}
                onClick={() => select("popular")}
              >
                <i className="fa-solid fa-fire" aria-hidden="true" />
                {t("sortPopular")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
