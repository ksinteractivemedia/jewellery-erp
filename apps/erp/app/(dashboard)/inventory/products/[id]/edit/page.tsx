import { EditProduct } from "../../../../../../components/catalog/edit-product";

export default function EditProductPage({ params }: { params: { id: string } }) {
  return <EditProduct id={params.id} />;
}
