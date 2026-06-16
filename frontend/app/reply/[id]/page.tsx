import ReplyThreadView from "./reply-view";

export const dynamic = "force-dynamic";

export default async function ReplyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReplyThreadView id={Number(id)} />;
}
