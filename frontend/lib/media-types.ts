/** Общие правила типов медиа для composer / reply. */

export const MEDIA_ACCEPT =
  "image/jpeg,image/jpg,image/png,image/webp,image/gif,.gif,.jpg,.jpeg,.png,.webp";

const EXT_TO_MIME: Record<string, string> = {
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function inferImageMime(file: File): string {
  const declared = (file.type || "").toLowerCase().trim();
  if (declared.startsWith("image/")) return declared;
  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
    : "";
  return EXT_TO_MIME[ext] ?? declared;
}

export function isAllowedImageFile(file: File): boolean {
  const mime = inferImageMime(file);
  return mime.startsWith("image/");
}

export function isGifFile(file: File): boolean {
  return inferImageMime(file) === "image/gif";
}

export interface MediaLike {
  mime?: string;
  url?: string;
}

export function isGifMedia(m: MediaLike): boolean {
  if ((m.mime || "").toLowerCase() === "image/gif") return true;
  const url = (m.url || "").split("?")[0].toLowerCase();
  return url.endsWith(".gif");
}
