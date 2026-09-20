import { Suspense } from "react";
import { StockList } from "../../../../components/inventory/stock-list";

// useSearchParams() (URL-synced filters) needs a Suspense boundary for static rendering.
export default function StockPage() {
  return (
    <Suspense>
      <StockList />
    </Suspense>
  );
}
