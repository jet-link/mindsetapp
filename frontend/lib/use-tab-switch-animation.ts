import { useCallback, useEffect, useRef, useState } from "react";

/** Длительность каскадного появления карточек после смены вкладки (мс). */
export const TAB_ENTER_MS = 720;

/**
 * При смене вкладки на короткое время включает классы входной анимации
 * для панели и первых элементов списка. Если контент ещё грузится, повторяет
 * анимацию карточек, когда данные появились.
 */
export function useTabSwitchAnimation(activeTab: string, contentReady = true) {
  const [panelEntering, setPanelEntering] = useState(false);
  const [itemEntering, setItemEntering] = useState(false);
  const prevTab = useRef(activeTab);
  const prevReady = useRef(contentReady);
  const mounted = useRef(false);
  const panelTimer = useRef<number | undefined>(undefined);
  const itemTimer = useRef<number | undefined>(undefined);

  const pulsePanel = useCallback(() => {
    window.clearTimeout(panelTimer.current);
    setPanelEntering(true);
    panelTimer.current = window.setTimeout(() => setPanelEntering(false), TAB_ENTER_MS);
  }, []);

  const pulseItems = useCallback(() => {
    window.clearTimeout(itemTimer.current);
    setItemEntering(true);
    itemTimer.current = window.setTimeout(() => setItemEntering(false), TAB_ENTER_MS);
  }, []);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      prevTab.current = activeTab;
      prevReady.current = contentReady;
      return;
    }

    if (prevTab.current !== activeTab) {
      prevTab.current = activeTab;
      prevReady.current = contentReady;
      pulsePanel();
      pulseItems();
      return;
    }

    if (!prevReady.current && contentReady) {
      pulseItems();
    }
    prevReady.current = contentReady;
  }, [activeTab, contentReady, pulsePanel, pulseItems]);

  useEffect(() => {
    return () => {
      window.clearTimeout(panelTimer.current);
      window.clearTimeout(itemTimer.current);
    };
  }, []);

  return {
    /** Класс для анимации появления панели вкладки. */
    panelEnterClass: panelEntering ? "tab-panel--enter" : "",
    /** Нужно ли анимировать первые карточки списка. */
    itemEnter: itemEntering,
  };
}
