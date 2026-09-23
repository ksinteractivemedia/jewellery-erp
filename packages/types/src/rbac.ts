/**
 * The permission and role vocabulary. Constants only (no logic) so the API, the ERP route
 * guards and the tests all share one spelling of every key — a typo becomes a compile error
 * instead of a silently-never-granted permission. The role -> permission *matrix* is
 * backend-only (apps/api/src/modules/auth/rbac) because it is authorization policy, and the
 * frontend must never be the source of truth for it.
 */
export const PERMISSIONS = {
  CATALOG_VIEW: "catalog.view",
  CATALOG_MANAGE: "catalog.manage",

  INVENTORY_VIEW: "inventory.view",
  INVENTORY_CREATE: "inventory.create",
  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_TRANSFER: "inventory.transfer",
  INVENTORY_APPROVE_ADJUSTMENT: "inventory.approve_adjustment",

  PRICING_VIEW: "pricing.view",
  PRICING_MANAGE: "pricing.manage",

  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_MANAGE: "customers.manage",

  SALES_VIEW: "sales.view",
  SALES_CREATE: "sales.create",
  SALES_CANCEL: "sales.cancel",
  SALES_DISCOUNT: "sales.discount",
  SALES_OVERRIDE_PRICE: "sales.override_price",

  B2B_VIEW: "b2b.view",
  B2B_CREATE_PO: "b2b.create_po",
  B2B_APPROVE_PO: "b2b.approve_po",
  B2B_OVERRIDE_CREDIT: "b2b.override_credit",

  PURCHASING_VIEW: "purchasing.view",
  PURCHASING_CREATE: "purchasing.create",
  PURCHASING_APPROVE: "purchasing.approve",
  PURCHASING_RECEIVE: "purchasing.receive",
  PURCHASING_CANCEL: "purchasing.cancel",

  PRODUCTION_VIEW: "production.view",
  PRODUCTION_CREATE: "production.create",
  PRODUCTION_APPROVE: "production.approve",

  RETURNS_VIEW: "returns.view",
  RETURNS_CREATE: "returns.create",
  RETURNS_APPROVE: "returns.approve",

  EXCHANGE_VIEW: "exchange.view",
  EXCHANGE_CREATE: "exchange.create",

  REPAIR_VIEW: "repair.view",
  REPAIR_CREATE: "repair.create",
  REPAIR_APPROVE: "repair.approve",

  ACCOUNTING_VIEW: "accounting.view",
  ACCOUNTING_CREATE_PAYMENT: "accounting.create_payment",
  ACCOUNTING_MANAGE: "accounting.manage",

  REPORTS_VIEW: "reports.view",

  SETTINGS_MANAGE_USERS: "settings.manage_users",
  SETTINGS_MANAGE_ROLES: "settings.manage_roles",
  SETTINGS_VIEW_AUDIT_LOGS: "settings.view_audit_logs",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS) as PermissionKey[];

export const ROLE_NAMES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  STORE_MANAGER: "STORE_MANAGER",
  SALES_MANAGER: "SALES_MANAGER",
  SALES_EXECUTIVE: "SALES_EXECUTIVE",
  INVENTORY_MANAGER: "INVENTORY_MANAGER",
  PURCHASE_MANAGER: "PURCHASE_MANAGER",
  PRODUCTION_MANAGER: "PRODUCTION_MANAGER",
  ACCOUNTANT: "ACCOUNTANT",
  WAREHOUSE_MANAGER: "WAREHOUSE_MANAGER",
  B2B_MANAGER: "B2B_MANAGER",
  CUSTOMER_SUPPORT: "CUSTOMER_SUPPORT",
  VIEWER: "VIEWER",
} as const;

export type RoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];
export const ALL_ROLE_NAMES = Object.values(ROLE_NAMES) as RoleName[];
