import ReplyThreadView from "./reply-view";

export const dynamic = "force-dynamic";

export default async function ReplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reply?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const raw = sp.reply ? Number(sp.reply) : null;
  const focusReplyId = raw && Number.isFinite(raw) ? raw : null;
  return <ReplyThreadView id={Number(id)} focusReplyId={focusReplyId} />;
}
