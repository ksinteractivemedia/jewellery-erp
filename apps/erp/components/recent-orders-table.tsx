"use client";

import { CurrencyDisplay, DataTable, type DataTableColumn, OrderStatusBadge, type OrderStatus } from "@jewellery/ui";

export interface RecentOrderRow {
  id: string;
  customer: string;
  channel: string;
  status: OrderStatus;
  amount: number;
}

/**
 * Column defs contain render functions, which can't cross the Server→Client
 * boundary as props — so this wrapper takes plain serializable row data from
 * the (server) dashboard page and builds the column config itself.
 */
export function RecentOrdersTable({ orders }: { orders: RecentOrderRow[] }) {
  const columns: DataTableColumn<RecentOrderRow>[] = [
    { id: "id", header: "Order", cell: (o) => <span className="font-medium">{o.id}</span>, mobileHidden: true },
    { id: "customer", header: "Customer", cell: (o) => o.customer },
    { id: "channel", header: "Channel", cell: (o) => <span className="text-muted">{o.channel}</span>, mobileHidden: true },
    { id: "status", header: "Status", cell: (o) => <OrderStatusBadge status={o.status} /> },
    { id: "amount", header: "Amount", align: "right", cell: (o) => <CurrencyDisplay amount={o.amount} size="sm" /> },
  ];

  return <DataTable columns={columns} data={orders} getRowId={(o) => o.id} mobileTitle={(o) => o.id} />;
}
