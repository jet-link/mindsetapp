import type { Metadata } from "next";
import Feed from "@/components/Feed";

export const metadata: Metadata = {
  title: "Main wall",
};

export const dynamic = "force-dynamic";

export default function FeedPage() {
  return <Feed />;
}
