import Link from "next/link";
import { Compass } from "lucide-react";
import { Button, EmptyState } from "@jewellery/ui";

function titleFromSlug(slug: string[]) {
  const last = slug[slug.length - 1] ?? "";
  return last
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Catches every portal link (catalogue categories, account pages, company pages) without real content yet. */
export default function StaticPlaceholderPage({ params }: { params: { slug: string[] } }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 sm:px-6">
      <EmptyState
        icon={<Compass className="h-8 w-8" />}
        title={titleFromSlug(params.slug)}
        description="This page is on the roadmap and isn't built yet — the navigation and layout are ready for it."
        action={
          <Button variant="secondary" asChild>
            <Link href="/">Back to home</Link>
          </Button>
        }
      />
    </div>
  );
}
