import type { StoreListResult } from "@jewellery/types";
import { storeGet } from "../../lib/api";
import { PAGE_SIZE, parseListingParams, toApiQuery } from "../../lib/listing-params";
import { Breadcrumbs } from "../ui/breadcrumbs";
import { ListingView } from "./listing-view";

/**
 * A product listing page: the server reads the first page for the URL it was asked for (fast, and visible to search engines),
 * then `ListingView` takes over so filters and sorting feel instant.
 */
export async function ListingPage({ basePath, scope, eyebrow, title, description, breadcrumb, searchParams, emptyHint, children }: {
  basePath: string;
  scope: { category?: string; collection?: string; q?: string };
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumb: { name: string; href?: string }[];
  searchParams: Record<string, string | string[] | undefined>;
  emptyHint?: string;
  children?: React.ReactNode;
}) {
  const params = parseListingParams(searchParams);
  const initial = await storeGet<StoreListResult>(`/products${toApiQuery(scope, params)}`);
  void PAGE_SIZE;
  return (
    <div className="container-page flex flex-col gap-10 pb-20 pt-6 sm:pt-8">
      <Breadcrumbs items={breadcrumb} />
      <header className="flex max-w-3xl flex-col gap-4">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="heading-display text-h1 sm:text-display" data-testid="listing-title">{title}</h1>
        {description && <p className="text-body-lg text-muted">{description}</p>}
      </header>
      {children}
      <ListingView basePath={basePath} scope={scope} initial={initial} initialParams={params} emptyHint={emptyHint} />
    </div>
  );
}
