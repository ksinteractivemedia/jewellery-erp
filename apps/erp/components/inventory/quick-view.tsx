"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { InventoryListItem } from "@jewellery/types";
import { Badge, Button, CurrencyDisplay, DetailPanel, HUIDDisplay, InventoryStatusBadge, PurityBadge, Skeleton, StockLocationBadge, WeightBreakdown, formatDate } from "@jewellery/ui";
import { useInventoryItem } from "../../lib/api/inventory-queries";
import { rupees, shortId } from "../../lib/inventory/format";

/** Right-hand panel for inspecting one piece without leaving the list. */
export function QuickView({ item, onClose }: { item: InventoryListItem | null; onClose: () => void }) {
  const detail = useInventoryItem(item?.id ?? "");
  const d = detail.data;
  return (
    <DetailPanel
      open={item !== null}
      onOpenChange={(o) => !o && onClose()}
      title={item?.itemCode ?? ""}
      description={item?.product ? `${item.product.name} · ${item.product.sku}` : "Not linked to a catalogue product"}
      footer={
        item && (
          <Button asChild className="w-full sm:w-auto">
            <Link href={`/inventory/stock/${item.id}`}>
              Open full detail <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        )
      }
    >
      {item && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <InventoryStatusBadge status={item.status} />
            {item.availableForSale && <Badge variant="success">Available for sale</Badge>}
            {item.reservedForOrder && <Badge variant="info">Reserved · …{shortId(item.reservedForOrder)}</Badge>}
            <PurityBadge purity={item.purity} />
          </div>
          <dl className="grid grid-cols-2 gap-4 text-body-sm">
            <div><dt className="text-caption text-muted">Location</dt><dd><StockLocationBadge name={item.location.name} type={item.location.type} /></dd></div>
            <div><dt className="text-caption text-muted">HUID</dt><dd><HUIDDisplay huid={item.huid} hallmarkingStatus={item.hallmarkStatus} /></dd></div>
            <div><dt className="text-caption text-muted">Metal</dt><dd>{item.metal.name}</dd></div>
            <div><dt className="text-caption text-muted">Barcode</dt><dd className="font-mono">{item.barcode ?? <span className="text-muted">—</span>}</dd></div>
          </dl>
          <WeightBreakdown gross={item.grossWeight} stone={item.stoneWeight} netMetal={item.netWeight} fineMetal={item.fineWeight} />
          <div className="flex flex-col gap-1 border-t border-border-subtle pt-4 text-body-sm">
            <div className="flex justify-between"><span className="text-muted">Book cost</span><CurrencyDisplay amount={rupees(item.cost)} /></div>
            {detail.isLoading ? <Skeleton className="h-5 w-full" /> : d?.valuation.metalValuePaise !== undefined ? (
              <div className="flex justify-between"><span className="text-muted">Metal value today</span><CurrencyDisplay amount={rupees(d.valuation.metalValuePaise)} /></div>
            ) : d ? <p className="text-caption text-muted">{d.valuation.metalValueNote}</p> : null}
          </div>
          <p className="text-caption text-muted">Updated {formatDate(item.updatedAt)}</p>
        </div>
      )}
    </DetailPanel>
  );
}
