import type { ReportDefinition } from "@jewellery/types";

const money = "money" as const;
const weight = "weight" as const;
const number_ = "number" as const;
const date = "date" as const;
const percent = "percent" as const;

/**
 * The registry: one row of metadata per report, driving both `/api/reports/registry` (what the ERP's
 * report index page lists) and the generic report screen (which filters to show, which columns to
 * render). Adding a report is adding one entry here plus one function in the matching
 * `*-reports.service.ts` — never a new screen.
 */
export const REPORT_REGISTRY: ReportDefinition[] = [
  // ---- Sales ------------------------------------------------------------------------------------
  {
    key: "sales-daily",
    category: "SALES",
    title: "Daily Sales",
    description: "Revenue, GST and order count for each day in the range, across both channels.",
    filters: ["dateRange", "branch", "location", "customerType"],
    columns: [
      { key: "date", label: "Date", format: date },
      { key: "orders", label: "Orders", format: number_, align: "right" },
      { key: "taxableValue", label: "Taxable value", format: money, align: "right" },
      { key: "gst", label: "GST", format: money, align: "right" },
      { key: "total", label: "Total", format: money, align: "right" },
    ],
  },
  {
    key: "sales-monthly",
    category: "SALES",
    title: "Monthly Sales",
    description: "The same figures, rolled up to a month — good for a year-on-year view.",
    filters: ["dateRange", "branch", "location", "customerType"],
    columns: [
      { key: "month", label: "Month", format: date },
      { key: "orders", label: "Orders", format: number_, align: "right" },
      { key: "taxableValue", label: "Taxable value", format: money, align: "right" },
      { key: "gst", label: "GST", format: money, align: "right" },
      { key: "total", label: "Total", format: money, align: "right" },
    ],
  },
  {
    key: "sales-b2c",
    category: "SALES",
    title: "B2C Sales",
    description: "Storefront orders only, by day.",
    filters: ["dateRange", "branch", "location"],
    columns: [
      { key: "date", label: "Date", format: date },
      { key: "orders", label: "Orders", format: number_, align: "right" },
      { key: "taxableValue", label: "Taxable value", format: money, align: "right" },
      { key: "gst", label: "GST", format: money, align: "right" },
      { key: "total", label: "Total", format: money, align: "right" },
    ],
  },
  {
    key: "sales-b2b",
    category: "SALES",
    title: "B2B Sales",
    description: "Issued wholesale invoices only, by day.",
    filters: ["dateRange", "branch", "location"],
    columns: [
      { key: "date", label: "Date", format: date },
      { key: "invoices", label: "Invoices", format: number_, align: "right" },
      { key: "taxableValue", label: "Taxable value", format: money, align: "right" },
      { key: "discount", label: "Discount given", format: money, align: "right" },
      { key: "gst", label: "GST", format: money, align: "right" },
      { key: "total", label: "Total", format: money, align: "right" },
    ],
  },
  {
    key: "sales-by-category",
    category: "SALES",
    title: "Sales by Category",
    description: "Revenue by product category, across both channels.",
    filters: ["dateRange", "customerType"],
    columns: [
      { key: "categoryName", label: "Category" },
      { key: "quantity", label: "Pieces sold", format: number_, align: "right" },
      { key: "taxableValue", label: "Taxable value", format: money, align: "right" },
      { key: "total", label: "Total", format: money, align: "right" },
    ],
  },
  {
    key: "sales-by-product",
    category: "SALES",
    title: "Sales by Product",
    description: "Revenue by SKU — every design sold in the range, best-sellers first.",
    filters: ["dateRange", "customerType", "category"],
    columns: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Product" },
      { key: "quantity", label: "Pieces sold", format: number_, align: "right" },
      { key: "taxableValue", label: "Taxable value", format: money, align: "right" },
      { key: "total", label: "Total", format: money, align: "right" },
    ],
  },
  {
    key: "sales-by-salesperson",
    category: "SALES",
    title: "Sales by Salesperson",
    description: "Wholesale revenue attributed to each customer's assigned salesperson.",
    filters: ["dateRange"],
    columns: [
      { key: "salespersonName", label: "Salesperson" },
      { key: "invoices", label: "Invoices", format: number_, align: "right" },
      { key: "taxableValue", label: "Taxable value", format: money, align: "right" },
      { key: "total", label: "Total", format: money, align: "right" },
    ],
  },
  {
    key: "sales-by-branch",
    category: "SALES",
    title: "Sales by Branch",
    description: "Revenue attributed to the branch each sold piece was actually dispatched from, derived from the ledger — never a field typed in by hand.",
    filters: ["dateRange", "customerType"],
    columns: [
      { key: "branchName", label: "Branch" },
      { key: "pieces", label: "Pieces sold", format: number_, align: "right" },
      { key: "total", label: "Total", format: money, align: "right" },
    ],
  },

  // ---- Inventory ----------------------------------------------------------------------------------
  {
    key: "inventory-by-sku",
    category: "INVENTORY",
    title: "Stock by SKU",
    description: "Current owned stock, one row per product/variant.",
    filters: ["branch", "location"],
    snapshot: true,
    columns: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Product" },
      { key: "quantity", label: "Pieces", format: number_, align: "right" },
      { key: "grossWeight", label: "Gross wt", format: weight, align: "right" },
      { key: "costValue", label: "Cost value", format: money, align: "right" },
    ],
  },
  {
    key: "inventory-by-location",
    category: "INVENTORY",
    title: "Stock by Location",
    description: "Current owned stock, grouped by where it physically is.",
    filters: ["branch"],
    snapshot: true,
    columns: [
      { key: "locationName", label: "Location" },
      { key: "branchName", label: "Branch" },
      { key: "quantity", label: "Pieces", format: number_, align: "right" },
      { key: "grossWeight", label: "Gross wt", format: weight, align: "right" },
      { key: "costValue", label: "Cost value", format: money, align: "right" },
    ],
  },
  {
    key: "inventory-by-metal",
    category: "INVENTORY",
    title: "Stock by Metal",
    description: "Current owned stock, grouped by metal.",
    filters: ["branch", "location"],
    snapshot: true,
    columns: [
      { key: "metalName", label: "Metal" },
      { key: "quantity", label: "Pieces", format: number_, align: "right" },
      { key: "grossWeight", label: "Gross wt", format: weight, align: "right" },
      { key: "fineWeight", label: "Fine wt", format: weight, align: "right" },
      { key: "costValue", label: "Cost value", format: money, align: "right" },
    ],
  },
  {
    key: "inventory-by-purity",
    category: "INVENTORY",
    title: "Stock by Purity",
    description: "Current owned stock, grouped by metal and purity.",
    filters: ["branch", "location"],
    snapshot: true,
    columns: [
      { key: "metalName", label: "Metal" },
      { key: "purity", label: "Purity" },
      { key: "quantity", label: "Pieces", format: number_, align: "right" },
      { key: "grossWeight", label: "Gross wt", format: weight, align: "right" },
      { key: "fineWeight", label: "Fine wt", format: weight, align: "right" },
    ],
  },
  {
    key: "inventory-value",
    category: "INVENTORY",
    title: "Stock Value",
    description: "Book cost of owned stock, by status — what's sellable vs. away with a partner vs. written down.",
    filters: ["branch", "location"],
    snapshot: true,
    columns: [
      { key: "statusLabel", label: "Status" },
      { key: "quantity", label: "Pieces", format: number_, align: "right" },
      { key: "grossWeight", label: "Gross wt", format: weight, align: "right" },
      { key: "costValue", label: "Cost value", format: money, align: "right" },
    ],
  },
  {
    key: "inventory-reserved",
    category: "INVENTORY",
    title: "Reserved Stock",
    description: "Every piece currently held for an order, with who's holding it and since when.",
    filters: ["branch", "location"],
    snapshot: true,
    columns: [
      { key: "itemCode", label: "Item" },
      { key: "sku", label: "SKU" },
      { key: "locationName", label: "Location" },
      { key: "reservedForType", label: "Held for" },
      { key: "reservedSince", label: "Since", format: date },
    ],
  },
  {
    key: "inventory-dead-stock",
    category: "INVENTORY",
    title: "Dead Stock",
    description: "Available finished jewellery that hasn't moved in a long time (180 days by default).",
    filters: ["branch", "location"],
    snapshot: true,
    columns: [
      { key: "itemCode", label: "Item" },
      { key: "sku", label: "SKU" },
      { key: "name", label: "Product" },
      { key: "locationName", label: "Location" },
      { key: "daysIdle", label: "Days idle", format: number_, align: "right" },
      { key: "costValue", label: "Cost value", format: money, align: "right" },
    ],
  },

  // ---- Gold -----------------------------------------------------------------------------------
  ...(["purchased", "issued", "consumed", "sold", "returned"] as const).map(
    (kind): ReportDefinition => ({
      key: `gold-${kind}` as ReportDefinition["key"],
      category: "GOLD",
      title: `Gold ${kind[0]!.toUpperCase()}${kind.slice(1)}`,
      description: {
        purchased: "Gold received in — purchase receipts and exchange trade-ins.",
        issued: "Gold sent out to manufacturing or a job worker.",
        consumed: "Gold that became part of a newly finished piece.",
        sold: "Gold sold to a customer, at the piece's own fine weight.",
        returned: "Gold that came back from a customer return.",
      }[kind],
      filters: ["dateRange", "branch", "location"],
      columns: [
        { key: "date", label: "Date", format: date },
        { key: "itemCode", label: "Item" },
        { key: "purity", label: "Purity" },
        { key: "grossWeight", label: "Gross wt", format: weight, align: "right" },
        { key: "fineWeight", label: "Fine wt", format: weight, align: "right" },
        { key: "reference", label: "Reference" },
      ],
    })
  ),
  {
    key: "gold-wastage",
    category: "GOLD",
    title: "Gold Wastage",
    description: "Wastage recorded on completed gold production and job-work orders — from each order's own material reconciliation, never a ledger guess.",
    filters: ["dateRange"],
    columns: [
      { key: "orderNo", label: "Order" },
      { key: "kind", label: "Type" },
      { key: "completedAt", label: "Date", format: date },
      { key: "wastageGrossWeight", label: "Wastage", format: weight, align: "right" },
      { key: "discrepancyGrossWeight", label: "Discrepancy", format: weight, align: "right" },
    ],
  },
  {
    key: "gold-fine-balance",
    category: "GOLD",
    title: "Fine Gold Balance",
    description: "Current fine gold held, by status — a snapshot, the same figure the ERP dashboard's stock position is built from.",
    filters: ["branch", "location"],
    snapshot: true,
    columns: [
      { key: "statusLabel", label: "Status" },
      { key: "quantity", label: "Pieces", format: number_, align: "right" },
      { key: "grossWeight", label: "Gross wt", format: weight, align: "right" },
      { key: "fineWeight", label: "Fine wt", format: weight, align: "right" },
    ],
  },

  // ---- B2B ------------------------------------------------------------------------------------
  {
    key: "b2b-customer-sales",
    category: "B2B",
    title: "Customer Sales",
    description: "Revenue per wholesale customer in the range.",
    filters: ["dateRange"],
    columns: [
      { key: "customerName", label: "Customer" },
      { key: "invoices", label: "Invoices", format: number_, align: "right" },
      { key: "taxableValue", label: "Taxable value", format: money, align: "right" },
      { key: "total", label: "Total", format: money, align: "right" },
    ],
  },
  {
    key: "b2b-outstanding",
    category: "B2B",
    title: "Outstanding",
    description: "Every open invoice and its balance, across every wholesale customer.",
    filters: [],
    snapshot: true,
    columns: [
      { key: "invoiceNo", label: "Invoice" },
      { key: "customerName", label: "Customer" },
      { key: "dueDate", label: "Due", format: date },
      { key: "total", label: "Total", format: money, align: "right" },
      { key: "balance", label: "Balance", format: money, align: "right" },
      { key: "status", label: "Status" },
    ],
  },
  {
    key: "b2b-ageing",
    category: "B2B",
    title: "Ageing",
    description: "Outstanding balance per customer, aged against the due date.",
    filters: [],
    snapshot: true,
    columns: [
      { key: "customerName", label: "Customer" },
      { key: "current", label: "Current", format: money, align: "right" },
      { key: "days1to30", label: "1–30 days", format: money, align: "right" },
      { key: "days31to60", label: "31–60 days", format: money, align: "right" },
      { key: "days61to90", label: "61–90 days", format: money, align: "right" },
      { key: "over90", label: "90+ days", format: money, align: "right" },
      { key: "total", label: "Total", format: money, align: "right" },
    ],
  },
  {
    key: "b2b-credit-utilization",
    category: "B2B",
    title: "Credit Utilization",
    description: "Every wholesale customer's credit position — limit, drawn, available.",
    filters: [],
    snapshot: true,
    columns: [
      { key: "customerName", label: "Customer" },
      { key: "limit", label: "Limit", format: money, align: "right" },
      { key: "outstanding", label: "Outstanding", format: money, align: "right" },
      { key: "committed", label: "Committed", format: money, align: "right" },
      { key: "available", label: "Available", format: money, align: "right" },
      { key: "utilizationPercent", label: "Utilization", format: percent, align: "right" },
    ],
  },
  {
    key: "b2b-po-pipeline",
    category: "B2B",
    title: "PO Pipeline",
    description: "Every wholesale purchase order, by its current status.",
    filters: ["dateRange"],
    columns: [
      { key: "statusLabel", label: "Status" },
      { key: "count", label: "Purchase orders", format: number_, align: "right" },
      { key: "total", label: "Value", format: money, align: "right" },
    ],
  },

  // ---- Profitability ----------------------------------------------------------------------------
  {
    key: "profitability-summary",
    category: "PROFITABILITY",
    title: "Profitability Summary",
    description: "Revenue, cost of goods sold, gross profit, margin and discounts given — by day, or rolled up by month.",
    filters: ["dateRange", "customerType", "groupBy"],
    groupByOptions: [
      { value: "day", label: "By day" },
      { value: "month", label: "By month" },
    ],
    columns: [
      { key: "period", label: "Period", format: date },
      { key: "grossRevenue", label: "Gross revenue", format: money, align: "right" },
      { key: "discount", label: "Discount", format: money, align: "right" },
      { key: "netRevenue", label: "Net revenue", format: money, align: "right" },
      { key: "cost", label: "Cost of goods sold", format: money, align: "right" },
      { key: "grossProfit", label: "Gross profit", format: money, align: "right" },
      { key: "marginPercent", label: "Margin", format: percent, align: "right" },
    ],
  },
];

export const reportDefinition = (key: string): ReportDefinition | undefined => REPORT_REGISTRY.find((r) => r.key === key);
