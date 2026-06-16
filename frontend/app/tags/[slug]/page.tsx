import PageHeader from "@/components/PageHeader";
import ThemeCard from "@/components/ThemeCard";
import { getTagThemes } from "@/lib/api";

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

  let page;
  try {
    page = await getTagThemes(slug);
  } catch {
    return <p className="muted">The API is unavailable.</p>;
  }

  return (
    <main>
      <PageHeader title={`#${slug}`} />
      {page.results.length === 0 && <p className="muted">No posts with this tag yet.</p>}
      <div className="feed-list">
        {page.results.map((t) => (
          <ThemeCard key={t.id} theme={t} />
        ))}
      </div>
    </main>
  );
}
