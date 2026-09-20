"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { PERMISSIONS } from "@jewellery/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CurrencyDisplay,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  HUIDDisplay,
  InventoryStatusBadge,
  PageHeader,
  PurityBadge,
  Skeleton,
  StockLocationBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  WeightBreakdown,
  formatDate,
} from "@jewellery/ui";
import { inventoryApi } from "../../lib/api/inventory";
import { useInventoryItem, useInventoryMutation } from "../../lib/api/inventory-queries";
import { ApiError } from "../../lib/auth/api-client";
import { useAuth } from "../../lib/auth/auth-context";
import { LOCATION_TYPE_LABELS, rupees, shortId } from "../../lib/inventory/format";
import { operationsFor, type OperationSpec } from "../../lib/inventory/operations";
import { AdjustDialog } from "./adjust-dialog";
import { AuditHistory } from "./audit-history";
import { IdentifiersDialog } from "./identifiers-dialog";
import { ItemLabel } from "./item-label";
import { MoveDialog } from "./move-dialog";
import { LedgerLink, MovementHistory } from "./movement-history";
import { ReserveDialog } from "./reserve-dialog";

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <dt className="text-caption text-muted">{label}</dt>
    <dd className="text-body text-foreground">{children ?? <span className="text-muted">—</span>}</dd>
  </div>
);

const KIND_LABEL: Record<string, string> = { FINISHED_JEWELLERY: "Finished jewellery", RAW_MATERIAL: "Raw material", SEMI_FINISHED: "Semi-finished", LOOSE_STONE: "Loose stone" };

export function ItemDetailView({ id }: { id: string }) {
  const { can } = useAuth();
  const { data: item, isLoading, error } = useInventoryItem(id);
  const [op, setOp] = React.useState<OperationSpec | null>(null);
  const [dialog, setDialog] = React.useState<"reserve" | "adjust" | "identifiers" | null>(null);

  const release = useInventoryMutation(() => inventoryApi.release({ itemIds: [id], referenceId: item!.reservedForOrder! }), { success: "Reservation released" });

  const crumbs = [{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Stock", href: "/inventory/stock" }];
  if (isLoading) return <div className="flex flex-col gap-4"><Skeleton className="h-16" /><Skeleton className="h-72" /></div>;
  if (error || !item) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <>
        <PageHeader title={missing ? "Piece not found" : "Couldn't load piece"} breadcrumb={crumbs} />
        {missing ? <EmptyState title="This piece doesn't exist" action={<Button asChild variant="secondary"><Link href="/inventory/stock">Back to inventory</Link></Button>} /> : <Alert variant="danger">{error instanceof Error ? error.message : "Something went wrong."}</Alert>}
      </>
    );
  }

  const canMove = can(PERMISSIONS.INVENTORY_TRANSFER);
  const canReserve = (can(PERMISSIONS.SALES_CREATE) || canMove) && item.serialization === "UNIT";
  const canAdjust = can(PERMISSIONS.INVENTORY_ADJUST);
  const canEdit = can(PERMISSIONS.INVENTORY_CREATE);
  const ops = canMove ? operationsFor(item.status) : [];
  const listRow = { ...item, product: item.product && { id: item.product.id, sku: item.product.sku, name: item.product.name }, updatedAt: item.updatedAt } as never;
  const hasActions = ops.length > 0 || (canReserve && item.status === "AVAILABLE") || (canReserve && item.status === "RESERVED") || canAdjust || canEdit;
  const v = item.valuation;

  return (
    <>
      <PageHeader
        title={item.itemCode}
        description={item.product ? `${item.product.name} · ${item.product.sku}` : "Not linked to a catalogue product"}
        breadcrumb={[...crumbs, { label: item.itemCode }]}
        actions={
          hasActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button>Actions <ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {ops.map((o) => <DropdownMenuItem key={o.kind} onSelect={() => setOp(o)}>{o.label}</DropdownMenuItem>)}
                {canReserve && item.status === "AVAILABLE" && <DropdownMenuItem onSelect={() => setDialog("reserve")}>Reserve for an order…</DropdownMenuItem>}
                {canReserve && item.status === "RESERVED" && <DropdownMenuItem onSelect={() => release.mutate(undefined)}>Release reservation</DropdownMenuItem>}
                {(ops.length > 0 || canReserve) && (canAdjust || canEdit) && <DropdownMenuSeparator />}
                {canEdit && <DropdownMenuItem onSelect={() => setDialog("identifiers")}>Edit identifiers…</DropdownMenuItem>}
                {canAdjust && <DropdownMenuItem onSelect={() => setDialog("adjust")}>Request adjustment…</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2 pb-4">
        <InventoryStatusBadge status={item.status} />
        {item.availableForSale && <Badge variant="success">Available for sale</Badge>}
        {item.reservedForOrder && <Badge variant="info">Reserved · …{shortId(item.reservedForOrder)}</Badge>}
        <PurityBadge purity={item.purity} />
        <StockLocationBadge name={item.location.name} type={item.location.type} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Product</CardTitle></CardHeader>
            <CardContent>
              {item.product ? (
                <div className="flex items-center gap-3">
                  {item.product.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.product.imageUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
                  )}
                  <div className="flex flex-col">
                    <Link href={`/inventory/products/${item.product.id}`} className="font-medium text-foreground hover:text-primary-active hover:underline">{item.product.name}</Link>
                    <span className="font-mono text-body-sm text-muted">{item.product.sku}{item.variant ? ` · ${item.variant.sku}` : ""}</span>
                    {item.product.categoryName && <span className="text-caption text-muted">{item.product.categoryName}</span>}
                  </div>
                </div>
              ) : <p className="text-body-sm text-muted">This is not linked to a catalogue product (raw material, or a piece made outside the catalogue).</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Physical item</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-4">
                <Fact label="Item code"><span className="font-mono">{item.itemCode}</span></Fact>
                <Fact label="Kind">{KIND_LABEL[item.type] ?? item.type}</Fact>
                <Fact label="Barcode">{item.barcode && <span className="font-mono">{item.barcode}</span>}</Fact>
                <Fact label="Serial number">{item.serialNumber && <span className="font-mono">{item.serialNumber}</span>}</Fact>
                <Fact label="Tracked as">{item.serialization === "UNIT" ? "Single piece" : `Batch · ${item.quantity} on hand`}</Fact>
                <Fact label="Received">{formatDate(item.createdAt)}</Fact>
              </dl>
              <div className="border-t border-border-subtle pt-4"><ItemLabel itemCode={item.itemCode} purity={item.purity} netWeight={item.netWeight} huid={item.huid} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Weights</CardTitle></CardHeader>
            <CardContent><WeightBreakdown gross={item.grossWeight} stone={item.stoneWeight} netMetal={item.netWeight} fineMetal={item.fineWeight} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Purity &amp; hallmark</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <Fact label="Metal">{item.metal.name}</Fact>
                <Fact label="Purity">{item.purity} <span className="text-caption text-muted">(fineness {item.fineness})</span></Fact>
                <Fact label="HUID"><HUIDDisplay huid={item.huid} hallmarkingStatus={item.hallmarkStatus} /></Fact>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cost &amp; valuation</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between"><span className="text-body-sm text-muted">Book cost</span><CurrencyDisplay amount={rupees(v.costPaise)} /></div>
              {v.metalValuePaise !== undefined ? (
                <>
                  <div className="flex items-baseline justify-between"><span className="text-body-sm text-muted">Metal value today</span><CurrencyDisplay amount={rupees(v.metalValuePaise)} /></div>
                  <p className="text-caption text-muted">Fine weight at {v.ratePurity} {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(rupees(v.ratePerGramPaise!))}/g{v.rateEffectiveFrom && <> (effective {formatDate(v.rateEffectiveFrom)})</>}. {v.metalValueNote} Excludes making charges, stones and tax — not a selling price.</p>
                </>
              ) : <p className="text-caption text-muted">{v.metalValueNote}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Location &amp; status</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <Fact label="Location"><StockLocationBadge name={item.location.name} type={item.location.type} /></Fact>
                <Fact label="Location type">{LOCATION_TYPE_LABELS[item.location.type]}</Fact>
                <Fact label="Status"><InventoryStatusBadge status={item.status} /></Fact>
                <Fact label="Reserved for order">{item.reservedForOrder && <span className="font-mono text-body-sm">…{shortId(item.reservedForOrder)}</span>}</Fact>
              </dl>
              {item.reservation?.expiresAt && <p className="pt-3 text-caption text-muted">Hold expires {formatDate(item.reservation.expiresAt)}.</p>}
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardContent className="pt-6">
            <Tabs defaultValue="movements">
              <TabsList className="mb-4" aria-label="History">
                <TabsTrigger value="movements">Movement history</TabsTrigger>
                <TabsTrigger value="audit">Audit history</TabsTrigger>
              </TabsList>
              <TabsContent value="movements"><MovementHistory itemId={item.id} /><div className="pt-4"><LedgerLink itemId={item.id} /></div></TabsContent>
              <TabsContent value="audit"><AuditHistory itemId={item.id} /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <MoveDialog op={op} items={op ? [listRow] : []} onClose={() => setOp(null)} onDone={() => setOp(null)} />
      <ReserveDialog itemIds={[item.id]} open={dialog === "reserve"} onClose={() => setDialog(null)} onDone={() => setDialog(null)} />
      <AdjustDialog item={item} open={dialog === "adjust"} onClose={() => setDialog(null)} />
      <IdentifiersDialog item={item} open={dialog === "identifiers"} onClose={() => setDialog(null)} />
    </>
  );
}
