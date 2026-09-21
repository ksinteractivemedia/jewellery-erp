"use client";

import * as React from "react";
import { Alert, Badge, EmptyState, PageHeader, Skeleton } from "@jewellery/ui";
import { Calculator } from "lucide-react";
import { usePricingMeta, usePricingPreview } from "../../lib/api/pricing-queries";
import { errorMessage } from "../../lib/api/queries";
import { EMPTY_FORM, buildPreviewRequest, type PlaygroundForm } from "../../lib/pricing/playground";
import { EXAMPLES, exampleToForm } from "../../lib/pricing/examples";
import { BreakdownPanel } from "./breakdown-panel";
import { PlaygroundFormPanel } from "./playground-form";

/** How long the form must sit still before the calculation is re-run — so typing "6500" is one request, not four. */
const DEBOUNCE_MS = 350;

/**
 * Internal what-if pricing for an administrator: type a piece, a rate, the charges and a customer type and see the
 * complete breakdown the pricing engine returns. It reads no order and writes nothing.
 */
export function PlaygroundView() {
  const meta = usePricingMeta();
  const [form, setForm] = React.useState<PlaygroundForm>(EMPTY_FORM);

  // Start from the first example once the metal master has loaded, so the page opens on a real calculation.
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current || !meta.data) return;
    seeded.current = true;
    setForm(exampleToForm(EXAMPLES[0]!, meta.data));
  }, [meta.data]);

  const built = React.useMemo(() => buildPreviewRequest(form), [form]);
  const [request, setRequest] = React.useState(built.request);
  const requestKey = JSON.stringify(built.request);
  React.useEffect(() => {
    const timer = setTimeout(() => setRequest(built.request), built.request ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [requestKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = usePricingPreview(request);
  const pending = built.request !== null && (requestKey !== JSON.stringify(request) || result.isFetching);

  return (
    <>
      <PageHeader
        title="Pricing playground"
        description="Try a piece, a rate and the charges, and see the complete price the pricing engine produces. Nothing here touches an order, an invoice or stock."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Pricing" }, { label: "Playground" }]}
        actions={<Badge variant="neutral">Internal · not connected to orders</Badge>}
      />
      {meta.isError && <Alert variant="danger" title="Couldn't load metals and purities" className="mb-4">{errorMessage(meta.error)}</Alert>}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <PlaygroundFormPanel form={form} errors={built.errors} meta={meta.data} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} onReplace={setForm} />
        <div className="xl:sticky xl:top-4" data-testid="playground-result">
          {result.isError && request ? (
            <Alert variant="danger" title="This can’t be priced yet" data-testid="playground-error">{errorMessage(result.error)}</Alert>
          ) : result.data && request ? (
            <BreakdownPanel breakdown={result.data} stale={pending} />
          ) : request && result.isLoading ? (
            <div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-80" /></div>
          ) : (
            <EmptyState icon={<Calculator className="h-8 w-8" />} title="Fill in the piece to see its price" description="Metal, purity, weight, the metal rate and the tax details are needed. The calculation updates as you type." />
          )}
        </div>
      </div>
    </>
  );
}
