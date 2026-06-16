import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Не срезать завершающий слэш: Django-роуты заканчиваются на "/",
  // а 308-редирект Next ломает POST-запросы (RuntimeError в APPEND_SLASH).
  skipTrailingSlashRedirect: true,
  // Убрать плавающий dev-индикатор Next.js (кнопка «N» в углу).
  devIndicators: false,
  async rewrites() {
    // Прокси к Django в dev: фронт и API на одном origin, без CORS-боли.
    // Правила с явным "/" в конце идут первыми: `:path*` при подстановке
    // в destination теряет завершающий слэш, а Django-роуты на нем настаивают.
    const api = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";
    return [
      { source: "/api/:path*/", destination: `${api}/api/:path*/` },
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/media/:path*/", destination: `${api}/media/:path*/` },
      { source: "/media/:path*", destination: `${api}/media/:path*` },
    ];
  },
};

export default nextConfig;
