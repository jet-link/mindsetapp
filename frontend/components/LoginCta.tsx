"use client";

import Link from "next/link";

export default function LoginCta() {
  return (
    <div className="login-cta" role="region" aria-label="Log in or sign up">
      <div className="login-cta__inner">
        <span className="login-cta__text">
          Log in or sign up to like, reply, repost and share your own themes.
        </span>
        <div className="login-cta__actions">
          <Link href="/login" className="btn">
            Log in
          </Link>
          <Link href="/login?mode=signup" className="btn btn--ghost">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
