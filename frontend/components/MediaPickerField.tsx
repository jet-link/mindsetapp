"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  type MediaLimitKind,
  mediaLimitExceededMessage,
} from "@/lib/media-limit";
import { isAllowedImageFile, MEDIA_ACCEPT } from "@/lib/media-types";

const REMOVE_ANIM_MS = 200;

let nextItemId = 0;

export interface PickedItem {
  id: number;
  file: File;
}

export interface MediaPicker {
  items: PickedItem[];
  files: File[];
  error: string;
  overLimit: boolean;
  max: number;
  kind: MediaLimitKind;
  addFiles: (selected: FileList | null) => void;
  remove: (id: number) => void;
  clear: () => void;
}

/** Состояние выбора медиа: общий хук для composer и формы ответа. */
export function useMediaPicker(max: number, kind: MediaLimitKind): MediaPicker {
  const { t } = useTranslation("errors");
  const [items, setItems] = useState<PickedItem[]>([]);
  const [typeError, setTypeError] = useState("");

  const addFiles = useCallback((selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    const incoming = Array.from(selected).filter(isAllowedImageFile);
    if (incoming.length === 0) {
      setTypeError(t("unsupportedFileType"));
      return;
    }
    setTypeError("");
    setItems((cur) => [
      ...cur,
      ...incoming.map((file) => ({ id: nextItemId++, file })),
    ]);
  }, [t]);

  const remove = useCallback((id: number) => {
    setTypeError("");
    setItems((cur) => cur.filter((it) => it.id !== id));
  }, []);

  const clear = useCallback(() => {
    setTypeError("");
    setItems([]);
  }, []);

  const files = useMemo(() => items.map((it) => it.file), [items]);
  const overLimit = items.length > max;
  // Ошибка лимита всегда отражает текущее число картинок: удалил одну —
  // счётчик уменьшился. Ошибка типа файла — разовая, до следующего выбора.
  const error = overLimit
    ? mediaLimitExceededMessage(kind, items.length, max)
    : typeError;

  return { items, files, error, overLimit, max, kind, addFiles, remove, clear };
}

/** Кнопка-скрепка + скрытый input. Ставится рядом с кнопкой Post/Reply. */
export function MediaAttachButton({
  picker,
  disabled = false,
}: {
  picker: MediaPicker;
  disabled?: boolean;
}) {
  const { t } = useTranslation("feed");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const atLimit = picker.items.length >= picker.max;
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => {
          picker.addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="icon-btn"
        disabled={disabled}
        title={atLimit ? t("maxItems", { count: picker.max }) : t("attachPhoto")}
        aria-label={t("attachPhoto")}
        onClick={() => inputRef.current?.click()}
      >
        <i className="fa-solid fa-paperclip" aria-hidden="true" />
      </button>
    </>
  );
}

/** Превью выбранных медиа. Ставится отдельным блоком (под кнопками). */
export function MediaPreviews({ picker }: { picker: MediaPicker }) {
  const { t } = useTranslation("feed");
  const { items, remove, error } = picker;

  // Стабильные object-URL по id: создаём только для новых файлов, отзываем
  // удалённые. Так нет мерцания при добавлении и нет пустого src в консоли.
  const urlsRef = useRef<Map<number, string>>(new Map());
  const [, force] = useReducer((x) => x + 1, 0);
  const [removing, setRemoving] = useState<Set<number>>(new Set());

  useEffect(() => {
    const map = urlsRef.current;
    const currentIds = new Set(items.map((it) => it.id));
    for (const [id, url] of map) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(url);
        map.delete(id);
      }
    }
    let added = false;
    for (const it of items) {
      if (!map.has(it.id)) {
        map.set(it.id, URL.createObjectURL(it.file));
        added = true;
      }
    }
    if (added) force();
  }, [items]);

  useEffect(() => {
    const map = urlsRef.current;
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  const handleRemove = useCallback(
    (id: number) => {
      setRemoving((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      window.setTimeout(() => {
        remove(id);
        setRemoving((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, REMOVE_ANIM_MS);
    },
    [remove],
  );

  if (items.length === 0 && !error) return null;

  return (
    <div className="media-picker">
      {items.length > 0 && (
        <div
          className={`media-picker__previews${items.length > 5 ? " media-picker__previews--scroll" : ""}`}
        >
          {items.map((it) => {
            const url = urlsRef.current.get(it.id);
            const isRemoving = removing.has(it.id);
            return (
              <div
                className={`media-picker__item${isRemoving ? " media-picker__item--removing" : ""}`}
                key={it.id}
              >
                {url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={url} alt="" decoding="async" />
                ) : null}
                <button
                  type="button"
                  className="media-picker__remove"
                  aria-label={t("remove")}
                  disabled={isRemoving}
                  onClick={() => handleRemove(it.id)}
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {error && (
        <div className="error media-picker__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
