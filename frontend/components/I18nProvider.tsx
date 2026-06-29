"use client";

import { useEffect, useRef, useState } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { useTranslation } from "react-i18next";
import {
  AUTH_EVENT,
  getMe,
  isLoggedIn,
  updateMeLanguage,
} from "@/lib/api";
import {
  DEFAULT_LOCALE,
  LOCALE_CHANGE_EVENT,
  applyDocumentLocale,
  getActiveLocale,
  getStoredLocale,
  i18n,
  initI18n,
  isLocale,
  setLocale,
  type Locale,
} from "@/lib/i18n";

// Инициализируем i18next один раз при загрузке модуля (на en — совпадает с SSR).
// react-биндинг подключаем здесь, в клиентском модуле, чтобы он не попадал в
// граф серверных компонентов (react-i18next дёргает createContext при импорте).
initI18n(DEFAULT_LOCALE, initReactI18next);

// Порог, после которого долгая смена языка показывает полноэкранный прелоадер.
// Быстрые переключения (словарь уже в памяти) проходят без него.
const OVERLAY_DELAY_MS = 200;

function LanguageOverlay() {
  const { t } = useTranslation("settings");
  return (
    <div className="locale-switch-overlay" role="status" aria-live="polite">
      <span className="btn-spinner btn-spinner--dark" aria-hidden="true" />
      <span className="locale-switch-overlay__text">{t("changingLanguage")}</span>
    </div>
  );
}

export default function I18nProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [overlay, setOverlay] = useState(false);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Переключение языка с условным прелоадером (только если это занимает время). */
  async function switchLocale(
    next: Locale,
    options?: { persist?: boolean; emit?: boolean },
  ) {
    if (next === getActiveLocale()) {
      applyDocumentLocale(next);
      return;
    }
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setOverlay(true), OVERLAY_DELAY_MS);
    try {
      await setLocale(next, options);
    } finally {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
      overlayTimer.current = null;
      setOverlay(false);
    }
  }

  // Первичная инициализация языка и синхронизация с профилем при наличии входа.
  useEffect(() => {
    let cancelled = false;
    const stored = getStoredLocale();

    (async () => {
      await switchLocale(stored, { emit: false });
      if (cancelled || !isLoggedIn()) return;
      try {
        const me = await getMe();
        if (cancelled) return;
        const serverLocale = isLocale(me.language) ? me.language : null;
        if (!serverLocale) return;
        // Перечитываем выбор СВЕЖИМ: пользователь мог переключить язык, пока
        // грузился профиль. В этом случае его выбор главнее ответа сервера —
        // иначе поздний getMe откатил бы язык обратно.
        const freshStored = getStoredLocale();
        if (freshStored !== DEFAULT_LOCALE) {
          if (serverLocale !== freshStored) updateMeLanguage(freshStored).catch(() => {});
        } else if (serverLocale !== getActiveLocale()) {
          // Локального выбора не было — берём язык из профиля (сервер главнее).
          await switchLocale(serverLocale);
        }
      } catch {
        // профиль недоступен — остаёмся на локальном языке
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Синхронизация между инстансами (sidenav + header) и другими вкладками логики.
  useEffect(() => {
    const onLocaleChange = (e: Event) => {
      const next = (e as CustomEvent<Locale>).detail;
      if (next && next !== getActiveLocale()) {
        void switchLocale(next, { persist: false, emit: false });
      }
    };
    window.addEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // При входе пользователя подтягиваем язык из его профиля.
  useEffect(() => {
    const onAuth = () => {
      if (!isLoggedIn()) return;
      getMe()
        .then((me) => {
          const serverLocale = isLocale(me.language) ? me.language : null;
          const stored = getStoredLocale();
          if (!serverLocale) return;
          if (stored !== DEFAULT_LOCALE && serverLocale !== stored) {
            updateMeLanguage(stored).catch(() => {});
          } else if (serverLocale !== getActiveLocale()) {
            void switchLocale(serverLocale);
          }
        })
        .catch(() => {});
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      {children}
      {overlay && <LanguageOverlay />}
    </I18nextProvider>
  );
}
