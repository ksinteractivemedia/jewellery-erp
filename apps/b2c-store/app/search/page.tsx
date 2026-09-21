import type { Metadata } from "next";
import { ListingPage } from "../../components/listing/listing-page";

export const dynamic = "force-dynamic";
type Props = { searchParams: Record<string, string | string[] | undefined> };
const query = (sp: Props["searchParams"]) => (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim().slice(0, 100) ?? "";

// Search results are not pages worth indexing (and they change with every keystroke someone types into a URL).
export function generateMetadata({ searchParams }: Props): Metadata {
  const q = query(searchParams);
  return { title: q ? `Search: ${q}` : "Search", robots: { index: false, follow: true }, alternates: { canonical: "/search" } };
}

export default function SearchPage({ searchParams }: Props) {
  const q = query(searchParams);
  return (
    <ListingPage
      basePath="/search"
      scope={q ? { q } : {}}
      eyebrow={q ? "Search" : "All jewellery"}
      title={q ? `Results for “${q}”` : "All jewellery"}
      breadcrumb={[{ name: "Home", href: "/" }, { name: "Search" }]}
      searchParams={searchParams}
      emptyHint="Try a metal, a category or a collection name."
    />
  );
}
