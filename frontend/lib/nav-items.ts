export interface NavItem {
  href: string;
  icon: string;
  /** Ключ перевода в namespace `common`. */
  labelKey: string;
  authOnly?: boolean;
  authGated?: boolean;
  badge?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: "fa-regular fa-house", labelKey: "mainWall" },
  { href: "/search", icon: "fa-solid fa-magnifying-glass", labelKey: "search" },
  { href: "/compose", icon: "fa-solid fa-plus", labelKey: "createTheme", authGated: true },
  {
    href: "/notifications",
    icon: "fa-regular fa-bell",
    labelKey: "notifications",
    badge: true,
    authGated: true,
  },
];
