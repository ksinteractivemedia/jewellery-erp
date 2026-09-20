import { Suspense } from "react";
import { ProductList } from "../../../../components/catalog/product-list";

// useSearchParams() (URL-synced filters) needs a Suspense boundary for static rendering.
export default function ProductsPage() {
  return (
    <Suspense>
      <ProductList />
    </Suspense>
  );
}
