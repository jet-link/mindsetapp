"use client";

import { useEffect, useState } from "react";

const MOBILE_MQ = "(max-width: 820px)";
const MIN_SCROLL = 48;

export function useMobileHeaderScroll() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    let lastY = window.scrollY;
    let ticking = false;

    function syncHidden() {
      if (!mq.matches) {
        setHidden(false);
        return;
      }

      const y = window.scrollY;
      if (y <= 0) {
        setHidden(false);
      } else if (y > lastY && y > MIN_SCROLL) {
        setHidden(true);
      } else if (y < lastY) {
        setHidden(false);
      }
      lastY = y;
      ticking = false;
    }

    function onScroll() {
      if (!mq.matches) return;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(syncHidden);
      }
    }

    function onMqChange() {
      lastY = window.scrollY;
      if (!mq.matches) setHidden(false);
    }

    syncHidden();
    window.addEventListener("scroll", onScroll, { passive: true });
    mq.addEventListener("change", onMqChange);
    return () => {
      window.removeEventListener("scroll", onScroll);
      mq.removeEventListener("change", onMqChange);
    };
  }, []);

  return hidden;
}
