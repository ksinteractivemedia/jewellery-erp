import { ALL_PERMISSION_KEYS, PERMISSIONS as P, ROLE_NAMES as R, type PermissionKey, type RoleName } from "@jewellery/types";

const allViews = ALL_PERMISSION_KEYS.filter((k) => k.endsWith(".view"));

/**
 * The default role -> permission matrix. This file IS the authorization policy for system
 * roles: `syncRbac()` writes it to the database at boot, so the code is the source of truth
 * and a role can't drift by hand-editing a row. Nothing else in the codebase names a role.
 *
 * Deliberate shape: ADMIN is SUPER_ADMIN minus `settings.manage_roles`. Combined with the
 * "you can only grant permissions you hold" rule (authorization.service.ts) that one missing
 * permission is what stops an ADMIN from minting or editing a SUPER_ADMIN.
 */
export const DEFAULT_ROLE_MATRIX: Record<RoleName, PermissionKey[]> = {
  [R.SUPER_ADMIN]: [...ALL_PERMISSION_KEYS],
  [R.ADMIN]: ALL_PERMISSION_KEYS.filter((k) => k !== P.SETTINGS_MANAGE_ROLES),

  [R.STORE_MANAGER]: [
    P.CATALOG_VIEW, P.INVENTORY_VIEW, P.INVENTORY_CREATE, P.INVENTORY_ADJUST, P.INVENTORY_TRANSFER,
    P.PRICING_VIEW, P.CUSTOMERS_VIEW, P.CUSTOMERS_MANAGE,
    P.SALES_VIEW, P.SALES_CREATE, P.SALES_CANCEL, P.SALES_DISCOUNT,
    P.RETURNS_VIEW, P.RETURNS_CREATE, P.RETURNS_APPROVE, P.EXCHANGE_VIEW, P.EXCHANGE_CREATE, P.REPAIR_VIEW, P.REPAIR_CREATE, P.REPAIR_APPROVE,
    P.B2B_VIEW, P.PURCHASING_VIEW, P.REPORTS_VIEW,
  ],
  [R.SALES_MANAGER]: [
    P.CATALOG_VIEW, P.INVENTORY_VIEW, P.PRICING_VIEW, P.CUSTOMERS_VIEW, P.CUSTOMERS_MANAGE,
    P.SALES_VIEW, P.SALES_CREATE, P.SALES_CANCEL, P.SALES_DISCOUNT, P.SALES_OVERRIDE_PRICE,
    P.RETURNS_VIEW, P.RETURNS_CREATE, P.RETURNS_APPROVE, P.EXCHANGE_VIEW, P.EXCHANGE_CREATE,
    P.B2B_VIEW, P.REPORTS_VIEW,
  ],
  [R.SALES_EXECUTIVE]: [
    P.CATALOG_VIEW, P.INVENTORY_VIEW, P.PRICING_VIEW, P.CUSTOMERS_VIEW, P.SALES_VIEW, P.SALES_CREATE,
    P.RETURNS_VIEW, P.RETURNS_CREATE, P.EXCHANGE_VIEW, P.EXCHANGE_CREATE, P.REPAIR_VIEW, P.REPAIR_CREATE,
  ],
  [R.INVENTORY_MANAGER]: [
    P.CATALOG_VIEW, P.CATALOG_MANAGE,
    P.INVENTORY_VIEW, P.INVENTORY_CREATE, P.INVENTORY_ADJUST, P.INVENTORY_TRANSFER, P.INVENTORY_APPROVE_ADJUSTMENT,
    P.PRICING_VIEW, P.PURCHASING_VIEW, P.PRODUCTION_VIEW, P.RETURNS_VIEW, P.REPAIR_VIEW, P.REPORTS_VIEW,
  ],
  [R.PURCHASE_MANAGER]: [
    P.CATALOG_VIEW, P.INVENTORY_VIEW, P.PRICING_VIEW,
    P.PURCHASING_VIEW, P.PURCHASING_CREATE, P.PURCHASING_APPROVE, P.PURCHASING_RECEIVE, P.PURCHASING_CANCEL,
    // Recording/allocating supplier invoices and payments is accounting.create_payment's job (the ACCOUNTANT role) —
    // a purchase manager can see the payables position but not move money, the same separation B2B payments use.
    P.ACCOUNTING_VIEW, P.REPORTS_VIEW,
  ],
  [R.PRODUCTION_MANAGER]: [
    P.CATALOG_VIEW, P.INVENTORY_VIEW, P.INVENTORY_TRANSFER,
    P.PRODUCTION_VIEW, P.PRODUCTION_CREATE, P.PRODUCTION_APPROVE, P.REPORTS_VIEW,
  ],
  [R.ACCOUNTANT]: [
    P.ACCOUNTING_VIEW, P.ACCOUNTING_CREATE_PAYMENT, P.ACCOUNTING_MANAGE,
    P.SALES_VIEW, P.B2B_VIEW, P.PURCHASING_VIEW, P.CUSTOMERS_VIEW, P.INVENTORY_VIEW, P.REPORTS_VIEW,
  ],
  [R.WAREHOUSE_MANAGER]: [P.CATALOG_VIEW, P.INVENTORY_VIEW, P.INVENTORY_CREATE, P.INVENTORY_TRANSFER, P.PURCHASING_VIEW, P.PURCHASING_RECEIVE],
  [R.B2B_MANAGER]: [
    P.B2B_VIEW, P.B2B_CREATE_PO, P.B2B_APPROVE_PO, P.B2B_OVERRIDE_CREDIT,
    P.CUSTOMERS_VIEW, P.CUSTOMERS_MANAGE, P.SALES_VIEW, P.CATALOG_VIEW, P.PRICING_VIEW,
    P.INVENTORY_VIEW, P.ACCOUNTING_VIEW, P.REPORTS_VIEW, P.RETURNS_VIEW, P.RETURNS_CREATE, P.RETURNS_APPROVE,
  ],
  [R.CUSTOMER_SUPPORT]: [P.CUSTOMERS_VIEW, P.SALES_VIEW, P.B2B_VIEW, P.CATALOG_VIEW, P.INVENTORY_VIEW, P.RETURNS_VIEW, P.EXCHANGE_VIEW, P.REPAIR_VIEW],
  [R.VIEWER]: allViews,
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  SUPER_ADMIN: "Full access, including role management",
  ADMIN: "Full operational access; cannot manage roles",
  STORE_MANAGER: "Runs a branch: stock, sales and customers",
  SALES_MANAGER: "Sales, discounts and price overrides",
  SALES_EXECUTIVE: "Creates sales; no discounts or overrides",
  INVENTORY_MANAGER: "Stock, catalogue and adjustment approval",
  PURCHASE_MANAGER: "Supplier purchasing and approval",
  PRODUCTION_MANAGER: "Production orders and job work",
  ACCOUNTANT: "Payments, outstanding and financial views",
  WAREHOUSE_MANAGER: "Receiving and transferring stock",
  B2B_MANAGER: "Wholesale customers, purchase orders and credit",
  CUSTOMER_SUPPORT: "Read-only customer and order lookup",
  VIEWER: "Read-only access across the ERP",
};
