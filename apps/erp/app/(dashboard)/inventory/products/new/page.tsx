import { PageHeader } from "@jewellery/ui";
import { RequirePermission } from "../../../../../components/auth/require-permission";
import { ProductForm } from "../../../../../components/catalog/product-form";
import { PERMISSIONS } from "@jewellery/types";

export default function NewProductPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CATALOG_MANAGE}>
      <PageHeader title="New product" description="Define a design for the catalogue. Physical pieces are added through Inventory." breadcrumb={[{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Products", href: "/inventory/products" }, { label: "New" }]} />
      <ProductForm />
    </RequirePermission>
  );
}
