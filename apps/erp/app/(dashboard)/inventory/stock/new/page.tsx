import { PERMISSIONS } from "@jewellery/types";
import { PageHeader } from "@jewellery/ui";
import { RequirePermission } from "../../../../../components/auth/require-permission";
import { ReceiveItemForm } from "../../../../../components/inventory/receive-item-form";

export default function ReceiveStockPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_CREATE}>
      <PageHeader title="Receive stock" description="Bring a physical piece (or a batch) into inventory. It is recorded in the ledger as a purchase receipt." breadcrumb={[{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Stock", href: "/inventory/stock" }, { label: "Receive" }]} />
      <ReceiveItemForm />
    </RequirePermission>
  );
}
