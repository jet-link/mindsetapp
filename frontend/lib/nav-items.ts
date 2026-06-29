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
  { href: "/", icon: "fa-list-alt", labelKey: "mainWall" },
  { href: "/search", icon: "fa-search", labelKey: "search" },
  { href: "/compose", icon: "fa-plus-square-o", labelKey: "createTheme", authGated: true },
  {
    href: "/notifications",
    icon: "fa-bell",
    labelKey: "notifications",
    badge: true,
    authGated: true,
  },
];
