import { Suspense } from "react";
import { ProductionOrdersView } from "../../../../components/manufacturing/production-orders-view";

// useSearchParams() (deep-linking to one order, e.g. from Reconciliation) needs a Suspense boundary for static rendering.
export default function Page() {
  return (
    <Suspense>
      <ProductionOrdersView />
    </Suspense>
  );
}
