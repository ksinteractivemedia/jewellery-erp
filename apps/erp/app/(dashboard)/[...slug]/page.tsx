import { notFound } from "next/navigation";
import { Card, EmptyState } from "@jewellery/ui";
import { findNavItem } from "../../../lib/nav";

/**
 * Catch-all for every ERP nav destination that doesn't have real functionality yet.
 * One placeholder route instead of ~30 near-identical page files — see business-rules.md §7.1.
 */
export default function ModulePlaceholderPage({ params }: { params: { slug: string[] } }) {
  const pathname = `/${params.slug.join("/")}`;
  const item = findNavItem(pathname);

  if (!item) notFound();

  const Icon = item.icon;

  return (
    <Card>
      <EmptyState
        icon={<Icon className="h-8 w-8" />}
        title={`${item.label} isn't built yet`}
        description="This module is on the implementation roadmap (see docs/progress.md) — the navigation, layout and design system are ready for it, but the underlying data and workflows haven't shipped yet."
        className="border-none py-16"
      />
    </Card>
  );
}
