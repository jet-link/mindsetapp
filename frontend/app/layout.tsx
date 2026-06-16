import type { Metadata } from "next";
import BottomNav from "@/components/BottomNav";
import MentionHoverLayer from "@/components/MentionHoverLayer";
import MobileHeader from "@/components/MobileHeader";
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
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="/vendor/font-awesome/css/font-awesome.min.css"
        />
      </head>
      <body suppressHydrationWarning>
        <MobileHeader />
        <SideNav />
        <div className="shell">{children}</div>
        <MentionHoverLayer />
        <BottomNav />
      </body>
    </html>
  );
}
