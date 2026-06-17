import { useEffect, useState } from "react";

const COOLDOWN_RE = /try again in (\d+)/i;

/** Достаёт число секунд кулдауна из текста ошибки сервера (429), иначе null. */
export function parseCooldownSeconds(message: string): number | null {
  const m = COOLDOWN_RE.exec(message);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Обратный отсчёт кулдауна: блокируем кнопку и показываем сколько осталось. */
export function useCooldown() {
  const [seconds, setSeconds] = useState(0);
  const active = seconds > 0;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return {
    seconds,
    active,
    start: (s: number) => setSeconds(s),
  };
}
