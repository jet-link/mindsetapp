import PageHeader from "@/components/PageHeader";
import FollowList from "../follow-list";

export const dynamic = "force-dynamic";

export default async function FollowingPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return (
    <main>
      <PageHeader title="Following" />
      <FollowList username={username} kind="following" />
    </main>
  );
}
