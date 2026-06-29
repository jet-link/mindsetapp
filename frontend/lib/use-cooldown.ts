import { useCallback, useEffect, useState } from "react";
import {
  type CooldownScope,
  getCooldownRemaining,
  setCooldown,
} from "@/lib/cooldown-storage";

/**
 * Обратный отсчёт кулдауна с сохранением в sessionStorage (переживает уход со страницы).
 * `target` (например, `theme:5` / `reply:12`) делает блокировку точечной — по конкретной
 * теме/ответу, а не глобально по всей системе.
 */
export function useCooldown(scope: CooldownScope, target?: string) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const tick = () => setSeconds(getCooldownRemaining(scope, target));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [scope, target]);

  const start = useCallback(
    (s: number) => {
      setCooldown(scope, s, target);
      setSeconds(getCooldownRemaining(scope, target));
    },
    [scope, target],
  );

  return {
    seconds,
    active: seconds > 0,
    start,
  };
}
