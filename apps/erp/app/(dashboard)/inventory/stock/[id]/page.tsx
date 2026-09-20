import { ItemDetailView } from "../../../../../components/inventory/item-detail";

export default function InventoryItemPage({ params }: { params: { id: string } }) {
  return <ItemDetailView id={params.id} />;
}
