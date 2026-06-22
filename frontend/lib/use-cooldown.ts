import { useCallback, useEffect, useState } from "react";
import {
  type CooldownScope,
  getCooldownRemaining,
  setCooldown,
} from "@/lib/cooldown-storage";

const COOLDOWN_RE = /try again in (\d+)/i;

/** Достаёт число секунд кулдауна из текста ошибки сервера, иначе null. */
export function parseCooldownSeconds(message: string): number | null {
  const m = COOLDOWN_RE.exec(message);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Обратный отсчёт кулдауна с сохранением в sessionStorage (переживает уход со страницы). */
export function useCooldown(scope: CooldownScope) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const tick = () => setSeconds(getCooldownRemaining(scope));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [scope]);

  const start = useCallback(
    (s: number) => {
      setCooldown(scope, s);
      setSeconds(getCooldownRemaining(scope));
    },
    [scope],
  );

  return {
    seconds,
    active: seconds > 0,
    start,
  };
}
