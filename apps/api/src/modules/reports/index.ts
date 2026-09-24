/**
 * The reporting module: one consistent framework (`report-registry.ts` + `reports.service.ts`'s
 * dispatcher) instead of ~30 bespoke report implementations. Every report is a backend aggregation —
 * grouped/aggregated in MongoDB, so what reaches Node (and the browser) is always small: a row per
 * day/SKU/status/customer, never a raw collection dump. Detail-list reports (gold movements, dead
 * stock, reserved stock) are paginated with a real `$facet` skip/limit in the pipeline itself.
 */
export * from "./report-registry";
export * from "./report-filters";
export * from "./reports.service";
export * from "./csv";
