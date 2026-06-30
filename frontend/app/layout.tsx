import type { Metadata } from "next";
import BottomNav from "@/components/BottomNav";
import I18nProvider from "@/components/I18nProvider";
import MentionHoverLayer from "@/components/MentionHoverLayer";
import MobileHeader from "@/components/MobileHeader";
import RouteTitle from "@/components/RouteTitle";
import ServiceWorkerCleanup from "@/components/ServiceWorkerCleanup";
import SideNav from "@/components/SideNav";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Mindset",
    template: "%s | Mindset",
  },
  description: "Threads-like discussions",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem("mindset-theme");if(m!=="sun"&&m!=="night"&&m!=="auto")m="sun";var d=m==="night"||(m==="auto"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var t=d?"dark":"light";var e=document.documentElement;e.setAttribute("data-theme",t);e.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var l=localStorage.getItem("mindset-locale");if(l!=="en"&&l!=="ru"&&l!=="uz")l="en";var e=document.documentElement;e.setAttribute("lang",l);e.setAttribute("dir","ltr");}catch(e){}})();`,
          }}
        />
        {/* Font Awesome (kit) рисует иконки как SVG. По умолчанию он ЗАМЕНЯЕТ
            <i> на <svg>, из-за чего React падает с removeChild при ремоунте
            иконки (toggle лайка/пароля). Режим 'nest' вкладывает <svg> ВНУТРЬ
            <i>, поэтому DOM-узел остаётся под контролем React. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.FontAwesomeConfig={autoReplaceSvg:"nest",observeMutations:true};`,
          }}
        />
        <script
          src="https://kit.fontawesome.com/8e9347ccb1.js"
          crossOrigin="anonymous"
          async
        />
      </head>
      <body suppressHydrationWarning>
        <I18nProvider>
          <ServiceWorkerCleanup />
          <RouteTitle />
          <MobileHeader />
          <SideNav />
          <div className="shell">{children}</div>
          <MentionHoverLayer />
          <BottomNav />
        </I18nProvider>
      </body>
    </html>
  );
}
