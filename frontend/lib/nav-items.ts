export interface NavItem {
  href: string;
  icon: string;
  label: string;
  authOnly?: boolean;
  authGated?: boolean;
  badge?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: "fa-list-alt", label: "Main wall" },
  { href: "/search", icon: "fa-search", label: "Search" },
  { href: "/compose", icon: "fa-plus", label: "Create theme", authGated: true },
  {
    href: "/notifications",
    icon: "fa-bell",
    label: "Notifications",
    badge: true,
    authGated: true,
  },
];
