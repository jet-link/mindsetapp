"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,image/gif";
const ALLOWED_PREFIXES = ["image/"];

export interface MediaPicker {
  files: File[];
  error: string;
  max: number;
  addFiles: (selected: FileList | null) => void;
  removeAt: (idx: number) => void;
  clear: () => void;
}

/** Состояние выбора медиа: общий хук для composer и формы ответа. */
export function useMediaPicker(max: number): MediaPicker {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");

  const addFiles = useCallback(
    (selected: FileList | null) => {
      if (!selected || selected.length === 0) return;
      const incoming = Array.from(selected).filter((f) =>
        ALLOWED_PREFIXES.some((p) => f.type.startsWith(p)),
      );
      if (incoming.length === 0) {
        setError("Unsupported file type.");
        return;
      }
      setFiles((cur) => {
        const room = max - cur.length;
        if (room <= 0) {
          setError(`You can attach at most ${max} files.`);
          return cur;
        }
        setError(incoming.length > room ? `You can attach at most ${max} files.` : "");
        return [...cur, ...incoming.slice(0, room)];
      });
    },
    [max],
  );

  const removeAt = useCallback((idx: number) => {
    setError("");
    setFiles((cur) => cur.filter((_, i) => i !== idx));
  }, []);

  const clear = useCallback(() => {
    setError("");
    setFiles([]);
  }, []);

  return { files, error, max, addFiles, removeAt, clear };
}

/** Кнопка-скрепка + скрытый input. Ставится рядом с кнопкой Post/Reply. */
export function MediaAttachButton({
  picker,
  disabled = false,
}: {
  picker: MediaPicker;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const full = picker.files.length >= picker.max;
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
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
        disabled={disabled || full}
        title={full ? `Max ${picker.max} photos` : "Attach photo"}
        aria-label="Attach photo"
        onClick={() => inputRef.current?.click()}
      >
        <i className="fa fa-paperclip" aria-hidden="true" />
      </button>
    </>
  );
}

/** Превью выбранных медиа. Ставится отдельным блоком (под кнопками). */
export function MediaPreviews({ picker }: { picker: MediaPicker }) {
  const { files, error, removeAt } = picker;
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  if (files.length === 0 && !error) return null;

  return (
    <div className="media-picker">
      {files.length > 0 && (
        <div className="media-picker__previews">
          {files.map((f, idx) => (
            <div className="media-picker__item" key={`${f.name}-${f.size}-${idx}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previews[idx]} alt="" />
              <button
                type="button"
                className="media-picker__remove"
                aria-label="Remove"
                onClick={() => removeAt(idx)}
              >
                <i className="fa fa-times" aria-hidden="true" />
              </button>
            </div>
          ))}
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
