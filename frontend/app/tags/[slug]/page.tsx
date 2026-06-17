import PageHeader from "@/components/PageHeader";
import TagFeed from "@/components/TagFeed";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: `#${slug}` };
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main>
      <PageHeader title={`#${slug}`} />
      <TagFeed slug={slug} />
    </main>
  );
}
