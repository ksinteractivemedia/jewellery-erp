import { PERMISSIONS, type PermissionKey } from "@jewellery/types";

/** Human descriptions for every permission. Adding a key to PERMISSIONS without describing it here is a compile error. */
export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  [PERMISSIONS.CATALOG_VIEW]: "View products, variants and categories",
  [PERMISSIONS.CATALOG_MANAGE]: "Create and edit products, variants and categories",
  [PERMISSIONS.INVENTORY_VIEW]: "View inventory items, stock and the ledger",
  [PERMISSIONS.INVENTORY_CREATE]: "Receive new inventory items into stock",
  [PERMISSIONS.INVENTORY_ADJUST]: "Post stock adjustments (raises an approval where policy requires)",
  [PERMISSIONS.INVENTORY_TRANSFER]: "Transfer stock between locations and branches",
  [PERMISSIONS.INVENTORY_APPROVE_ADJUSTMENT]: "Approve stock adjustments raised by others",
  [PERMISSIONS.PRICING_VIEW]: "View metal rates, price lists and pricing rules",
  [PERMISSIONS.PRICING_MANAGE]: "Change metal rates, price lists and pricing rules",
  [PERMISSIONS.CUSTOMERS_VIEW]: "View customer records",
  [PERMISSIONS.CUSTOMERS_MANAGE]: "Create and edit customer records",
  [PERMISSIONS.SALES_VIEW]: "View orders and invoices",
  [PERMISSIONS.SALES_CREATE]: "Create orders and invoices",
  [PERMISSIONS.SALES_CANCEL]: "Cancel orders and invoices",
  [PERMISSIONS.SALES_DISCOUNT]: "Apply discounts within policy",
  [PERMISSIONS.SALES_OVERRIDE_PRICE]: "Override the calculated price on a sale",
  [PERMISSIONS.B2B_VIEW]: "View B2B customers, purchase orders and credit",
  [PERMISSIONS.B2B_CREATE_PO]: "Raise B2B purchase orders",
  [PERMISSIONS.B2B_APPROVE_PO]: "Approve B2B purchase orders",
  [PERMISSIONS.B2B_OVERRIDE_CREDIT]: "Allow an order beyond a customer's credit limit",
  [PERMISSIONS.PURCHASING_VIEW]: "View suppliers and purchase orders",
  [PERMISSIONS.PURCHASING_CREATE]: "Raise supplier purchase requisitions and purchase orders",
  [PERMISSIONS.PURCHASING_APPROVE]: "Approve supplier purchase requisitions and purchase orders",
  [PERMISSIONS.PURCHASING_RECEIVE]: "Post goods receipts against a purchase order",
  [PERMISSIONS.PURCHASING_CANCEL]: "Cancel a purchase requisition or purchase order",
  [PERMISSIONS.PRODUCTION_VIEW]: "View production orders and job work",
  [PERMISSIONS.PRODUCTION_CREATE]: "Create production orders and issue job work",
  [PERMISSIONS.PRODUCTION_APPROVE]: "Approve production orders and job-work reconciliation",
  [PERMISSIONS.RETURNS_VIEW]: "View B2C and B2B returns",
  [PERMISSIONS.RETURNS_CREATE]: "Request, receive and inspect a return",
  [PERMISSIONS.RETURNS_APPROVE]: "Approve, reject and settle a return",
  [PERMISSIONS.EXCHANGE_VIEW]: "View old-for-new jewellery exchanges",
  [PERMISSIONS.EXCHANGE_CREATE]: "Assess and complete an exchange",
  [PERMISSIONS.REPAIR_VIEW]: "View repair orders",
  [PERMISSIONS.REPAIR_CREATE]: "Intake, estimate and move a repair order through the workshop",
  [PERMISSIONS.REPAIR_APPROVE]: "Pass or fail a repair's quality check",
  [PERMISSIONS.ACCOUNTING_VIEW]: "View invoices, payments, outstanding balances and the general ledger",
  [PERMISSIONS.ACCOUNTING_CREATE_PAYMENT]: "Record and allocate payments",
  [PERMISSIONS.ACCOUNTING_MANAGE]: "Manage the chart of accounts and issue credit/debit notes",
  [PERMISSIONS.REPORTS_VIEW]: "View reports",
  [PERMISSIONS.SETTINGS_MANAGE_USERS]: "Create, edit, deactivate users and assign roles",
  [PERMISSIONS.SETTINGS_MANAGE_ROLES]: "Create and edit custom roles",
  [PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS]: "View the security audit log",
};

export function splitPermissionKey(key: string): { module: string; action: string } {
  const [module, ...rest] = key.split(".");
  return { module, action: rest.join(".") };
}
