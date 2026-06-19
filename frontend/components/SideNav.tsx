"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AUTH_EVENT,
  NOTIFICATION_EVENT,
  getUnreadNotificationsCount,
  isLoggedIn,
  getStoredUsername,
} from "@/lib/api";
import NavProfileLink from "@/components/NavProfileLink";
import { scheduleApplyCurrentTitle, scheduleHomePageTitle } from "@/components/RouteTitle";
import { bounceNavItem } from "@/lib/nav-bounce";
import { NAV_ITEMS, type NavItem } from "@/lib/nav-items";

const AUTH_REQUIRED_HREFS = new Set(["/compose", "/notifications"]);

function navHref(item: NavItem, username: string | null): string {
  if (AUTH_REQUIRED_HREFS.has(item.href) && !username) return "/login";
  return item.href;
}

export default function SideNav() {
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
  const [extrasOpen, setExtrasOpen] = useState(false);
  const extrasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!extrasOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!extrasRef.current?.contains(e.target as Node)) setExtrasOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [extrasOpen]);

  return (
    <aside className="sidenav">
      <Link
        href="/"
        className="sidenav__logo"
        title="Mindset"
        aria-label="Mindset"
        onClick={scheduleHomePageTitle}
      >
        <span className="logo-word">
          <span className="logo-mind">M</span>
          <span className="logo-set">s</span>
        </span>
      </Link>

      <nav className="sidenav__menu" aria-label="Main navigation">
        {NAV_ITEMS.map((it) => {
          if (it.authOnly && !username) return null;
          const href = navHref(it, username);
          const active = pathname === it.href;
          const isCurrent = pathname === href;
          return (
            <Link
              key={it.href}
              href={href}
              prefetch={it.href === "/compose" ? false : undefined}
              className={`sidenav__item${active ? " active" : ""}`}
              title={it.label}
              aria-label={it.label}
              aria-current={active ? "page" : undefined}
              onPointerDown={(e) => bounceNavItem(e.currentTarget)}
              onClick={
                it.href === "/"
                  ? scheduleHomePageTitle
                  : isCurrent
                    ? scheduleApplyCurrentTitle
                    : undefined
              }
            >
              <span className="sidenav__icon-wrap">
                <i className={`fa ${it.icon}`} aria-hidden="true" />
                {it.badge && unread > 0 && (
                  <span className="nav-badge" aria-label={`${unread} unread notifications`}>
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
        <NavProfileLink
          username={username}
          href={profileHref}
          active={profileActive}
          className="sidenav__item"
          onPointerDown={(e) => bounceNavItem(e.currentTarget)}
          onClick={profileActive ? scheduleApplyCurrentTitle : undefined}
        />
      </nav>

      <div className="sidenav__extras" ref={extrasRef}>
        <button
          type="button"
          className="sidenav__bars"
          aria-label="Menu"
          aria-expanded={extrasOpen}
          title="Menu"
          onClick={() => setExtrasOpen((v) => !v)}
        >
          <span />
          <span />
        </button>
        {extrasOpen && (
          <div className="sidenav__extras-panel" role="menu">
            <button type="button" className="sidenav__extras-item" role="menuitem">
              <i className="fa fa-sun" aria-hidden="true" />
              Theme
            </button>
            <button type="button" className="sidenav__extras-item" role="menuitem">
              <i className="fa fa-language" aria-hidden="true" />
              Language
            </button>
            <button type="button" className="sidenav__extras-item" role="menuitem">
              <i className="fa fa-bullhorn" aria-hidden="true" />
              Report a problem
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
