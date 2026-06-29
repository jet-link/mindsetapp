// Инициализация i18next + react-i18next.
//
// Производительность / ленивая загрузка:
//   - английский (язык по умолчанию и fallback) включён в основной бандл, чтобы
//     fallback всегда работал и не было «мигания» ключей;
//   - русский и узбекский загружаются динамически (отдельными чанками) только
//     при первом переключении на них;
//   - после смены языка неиспользуемые словари (кроме en) выгружаются из памяти.

import i18n, { type ThirdPartyModule } from "i18next";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
} from "./languages";

// --- Английский: статически в бандле (fallback + язык по умолчанию) ---
import enCommon from "@/locales/en/common.json";
import enAuth from "@/locales/en/auth.json";
import enFeed from "@/locales/en/feed.json";
import enProfile from "@/locales/en/profile.json";
import enSearch from "@/locales/en/search.json";
import enNotifications from "@/locales/en/notifications.json";
import enSettings from "@/locales/en/settings.json";
import enMessages from "@/locales/en/messages.json";
import enModeration from "@/locales/en/moderation.json";
import enErrors from "@/locales/en/errors.json";
import enDates from "@/locales/en/dates.json";

export const NAMESPACES = [
  "common",
  "auth",
  "feed",
  "profile",
  "search",
  "notifications",
  "settings",
  "messages",
  "moderation",
  "errors",
  "dates",
] as const;

export type Namespace = (typeof NAMESPACES)[number];

const EN_RESOURCES: Record<Namespace, Record<string, string>> = {
  common: enCommon,
  auth: enAuth,
  feed: enFeed,
  profile: enProfile,
  search: enSearch,
  notifications: enNotifications,
  settings: enSettings,
  messages: enMessages,
  moderation: enModeration,
  errors: enErrors,
  dates: enDates,
};

let initialized = false;

// react-i18next нельзя импортировать в графе серверных компонентов: при загрузке
// модуля он вызывает React.createContext, которого нет в RSC-рантайме. Поэтому
// react-биндинг передаётся снаружи — только из клиентского I18nProvider.
export function initI18n(
  initialLocale: Locale = DEFAULT_LOCALE,
  reactPlugin?: ThirdPartyModule,
) {
  if (initialized) return i18n;
  initialized = true;

  if (reactPlugin) i18n.use(reactPlugin);

  void i18n.init({
    // Стартуем на английском (совпадает с SSR); реальный язык применяется
    // в I18nProvider после монтирования, чтобы избежать рассинхрона гидрации.
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES,
    ns: NAMESPACES as unknown as string[],
    defaultNS: "common",
    resources: { en: EN_RESOURCES },
    interpolation: { escapeValue: false },
    returnNull: false,
    saveMissing: true,
    missingKeyHandler: (lngs, ns, key) => {
      if (process.env.NODE_ENV === "production") return;
      const lang = Array.isArray(lngs) ? lngs[0] : lngs;
      // Пользователю при этом всё равно показывается английский (fallback).
      console.warn(`Missing translation:\n${ns}.${key}\nLanguage: ${lang}`);
    },
    react: {
      useSuspense: false,
      // Перерисовываем компоненты не только при смене языка, но и когда
      // ресурсы языка догрузились/изменились — иначе уже смонтированные
      // (sidenav, текущая страница) могли застрять на дефолтном языке.
      bindI18n: "languageChanged loaded",
      bindI18nStore: "added removed",
    },
  });

  return i18n;
}

// Динамические загрузчики словарей для неосновных языков. Каждый ns —
// отдельный chunk, который webpack/Turbopack создаёт по контексту папки.
async function importNamespace(
  locale: Locale,
  ns: Namespace,
): Promise<Record<string, string>> {
  const mod = await import(`@/locales/${locale}/${ns}.json`);
  return (mod.default ?? mod) as Record<string, string>;
}

// Кэш загрузок «в полёте»: параллельные запросы одного языка ждут один промис,
// чтобы не было гонок и двойной регистрации словарей.
const inFlight = new Map<Locale, Promise<void>>();

/** Загружает все словари языка (если ещё не загружены) и регистрирует их. */
export async function loadLocaleResources(locale: Locale): Promise<void> {
  if (locale === DEFAULT_LOCALE) return; // en уже в бандле
  if (i18n.hasResourceBundle(locale, "common")) return; // уже загружен

  const pending = inFlight.get(locale);
  if (pending) return pending;

  const task = (async () => {
    const bundles = await Promise.all(
      NAMESPACES.map((ns) => importNamespace(locale, ns)),
    );
    NAMESPACES.forEach((ns, i) => {
      i18n.addResourceBundle(locale, ns, bundles[i], true, true);
    });
  })();

  inFlight.set(locale, task);
  try {
    await task;
  } finally {
    inFlight.delete(locale);
  }
}

/**
 * Освобождает словари языков, которые сейчас не используются (кроме en —
 * он нужен как fallback). Снижает потребление памяти при частых переключениях.
 *
 * Защита: никогда не выгружаем словарь активного языка i18next — иначе при
 * гонке переключений активный язык остался бы без переводов (всё падало бы на en).
 */
export function freeUnusedLocales(activeLocale: Locale): void {
  const current = (i18n.language || DEFAULT_LOCALE).split("-")[0];
  for (const locale of SUPPORTED_LOCALES) {
    if (
      locale === DEFAULT_LOCALE ||
      locale === activeLocale ||
      locale === current
    ) {
      continue;
    }
    if (!i18n.hasResourceBundle(locale, "common")) continue;
    for (const ns of NAMESPACES) {
      i18n.removeResourceBundle(locale, ns);
    }
  }
}

export { i18n };
export default i18n;
