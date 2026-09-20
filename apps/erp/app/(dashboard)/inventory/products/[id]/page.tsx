import { ProductDetailView } from "../../../../../components/catalog/product-detail";

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  return <ProductDetailView id={params.id} />;
}
