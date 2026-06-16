import PageHeader from "@/components/PageHeader";
import FollowList from "../follow-list";

export const dynamic = "force-dynamic";

export default async function FollowersPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return (
    <main>
      <PageHeader title="Followers" />
      <FollowList username={username} kind="followers" />
    </main>
  );
}
