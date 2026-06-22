"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AUTH_EVENT,
  NOTIFICATION_EVENT,
  getUnreadNotificationsCount,
  isLoggedIn,
  getStoredUsername,
} from "@/lib/api";
import NavProfileLink from "@/components/NavProfileLink";
import { scheduleApplyCurrentTitle, scheduleHomePageTitle } from "@/components/RouteTitle";
import { NAV_ITEMS, type NavItem } from "@/lib/nav-items";

function navItemIcon(it: NavItem, unread: number) {
  return (
    <span className="bottomnav__icon-wrap">
      <i className={`fa ${it.icon}`} aria-hidden="true" />
      {it.badge && unread > 0 && (
        <span className="nav-badge" aria-label={`${unread} unread notifications`}>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </span>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const [username, setUsername] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const syncAuth = () => setUsername(getStoredUsername());
    syncAuth();
    window.addEventListener(AUTH_EVENT, syncAuth);
    return () => window.removeEventListener(AUTH_EVENT, syncAuth);
  }, []);

  useEffect(() => {
    async function loadUnread() {
      if (!isLoggedIn()) {
        setUnread(0);
        return;
      }
      try {
        const r = await getUnreadNotificationsCount();
        setUnread(r.unread_count);
      } catch {
        setUnread(0);
      }
    }
    loadUnread();
    const onChange = () => loadUnread();
    window.addEventListener(NOTIFICATION_EVENT, onChange);
    window.addEventListener(AUTH_EVENT, onChange);
    return () => {
      window.removeEventListener(NOTIFICATION_EVENT, onChange);
      window.removeEventListener(AUTH_EVENT, onChange);
    };
  }, []);

  const profileHref = username ? `/u/${username}` : "/login";
  const profileActive = pathname === profileHref;

  return (
    <nav className="bottomnav" aria-label="Main navigation">
      {NAV_ITEMS.map((it) => {
        if (it.authOnly && !username) return null;
        const disabled = it.authGated && !username;
        const active = !disabled && pathname === it.href;
        if (disabled) {
          return (
            <span
              key={it.href}
              className="bottomnav__item bottomnav__item--disabled"
              title={it.label}
              aria-label={it.label}
              aria-disabled="true"
            >
              {navItemIcon(it, unread)}
            </span>
          );
        }
        const isCurrent = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`bottomnav__item${active ? " active" : ""}`}
            aria-label={it.label}
            title={it.label}
            onClick={
              it.href === "/"
                ? scheduleHomePageTitle
                : isCurrent
                  ? scheduleApplyCurrentTitle
                  : undefined
            }
          >
            {navItemIcon(it, unread)}
          </Link>
        );
      })}
      <NavProfileLink
        username={username}
        href={profileHref}
        active={profileActive}
        className="bottomnav__item"
        onClick={profileActive ? scheduleApplyCurrentTitle : undefined}
      />
    </nav>
  );
}
