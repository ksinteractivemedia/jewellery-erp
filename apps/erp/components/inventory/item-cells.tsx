import { HUIDDisplay, InventoryStatusBadge, StockLocationBadge, formatWeight } from "@jewellery/ui";
import type { InventoryListItem } from "@jewellery/types";
import { shortId } from "../../lib/inventory/format";

export function ItemStatusCell({ item }: { item: Pick<InventoryListItem, "status" | "availableForSale" | "reservedForOrder"> }) {
  return (
    <span className="flex flex-col gap-0.5">
      <InventoryStatusBadge status={item.status} />
      {item.reservedForOrder && <span className="text-caption text-muted">for order …{shortId(item.reservedForOrder)}</span>}
    </span>
  );
}

export const ItemLocationCell = ({ location }: { location: InventoryListItem["location"] }) => <StockLocationBadge name={location.name} type={location.type} />;
export const ItemHuidCell = ({ item }: { item: Pick<InventoryListItem, "huid" | "hallmarkStatus"> }) => <HUIDDisplay huid={item.huid} hallmarkingStatus={item.hallmarkStatus} />;
export const Grams = ({ value }: { value: number }) => <span className="tabular">{formatWeight(value)}</span>;
