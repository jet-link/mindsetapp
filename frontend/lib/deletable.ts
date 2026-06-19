const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinDeleteWindow(createdAt: string): boolean {
  const ts = Date.parse(createdAt);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < DELETE_WINDOW_MS;
}
