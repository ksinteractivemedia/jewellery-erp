import type { InventoryDashboard, StockBreakdownRow } from "@jewellery/types";
import { valueOfMetal } from "@jewellery/pricing-engine";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import { OWNED_STATUSES } from "../inventory/movement-rules";
import { MetalModel } from "../metals/metal.model";
import { MetalRateModel } from "../metals/metal-rate.model";
import { LocationModel } from "../organization/location.model";
import { itemScope, type LocationScope } from "./scope";

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const id = (v: unknown) => String(v);

interface Group {
  _id: { metalId: unknown; purity: string; locationId: unknown };
  pieces: number;
  netWeight: number;
  fineWeight: number;
  cost: number;
  available: number;
  reservedPieces: number;
  reservedFine: number;
}

const empty = (key: string, label: string, sublabel?: string): StockBreakdownRow => ({ key, label, ...(sublabel ? { sublabel } : {}), pieces: 0, netWeight: 0, fineWeight: 0, cost: 0, availablePieces: 0 });

/**
 * The stock position of the business (or of one branch/location): everything still owned — every status
 * except SOLD and MELTING — rolled up once by (metal, purity, location) and then folded into each view, so
 * the panels can never disagree with one another. Real data from the database, read-only.
 */
export async function loadInventoryDashboard(scope: LocationScope, now: Date): Promise<InventoryDashboard> {
  const groups = await InventoryItemModel.aggregate<Group>([
    { $match: { status: { $in: OWNED_STATUSES }, ...itemScope(scope) } },
    {
      $group: {
        _id: { metalId: "$metalId", purity: "$purity", locationId: "$locationId" },
        pieces: { $sum: 1 },
        netWeight: { $sum: "$netWeight" },
        fineWeight: { $sum: "$fineWeight" },
        cost: { $sum: "$cost" },
        // Same definition of "sellable" as the stock screens: finished jewellery, AVAILABLE, not reserved.
        available: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "AVAILABLE"] }, { $eq: ["$type", "FINISHED_JEWELLERY"] }, { $not: ["$reservation"] }] }, 1, 0] } },
        reservedPieces: { $sum: { $cond: [{ $eq: ["$status", "RESERVED"] }, 1, 0] } },
        reservedFine: { $sum: { $cond: [{ $eq: ["$status", "RESERVED"] }, "$fineWeight", 0] } },
      },
    },
  ]);

  const [metals, locations, rates] = await Promise.all([
    MetalModel.find({}).select("code name purityOptions").lean(),
    LocationModel.find({ _id: { $in: groups.map((g) => g._id.locationId) } }).select("name type").lean(),
    // The newest quote per (metal, purity) effective now.
    MetalRateModel.aggregate<{ _id: { metalId: unknown; purity: string }; ratePerGram: number }>([
      { $match: { effectiveFrom: { $lte: now } } },
      { $sort: { effectiveFrom: -1 } },
      { $group: { _id: { metalId: "$metalId", purity: "$purity" }, ratePerGram: { $first: "$ratePerGram" } } },
    ]),
  ]);
  const metalById = new Map(metals.map((m) => [id(m._id), m]));
  const locationById = new Map(locations.map((l) => [id(l._id), l]));
  const rateKey = (metalId: unknown, purity: string) => `${id(metalId)}:${purity}`;
  const rateByKey = new Map(rates.map((r) => [rateKey(r._id.metalId, r._id.purity), r.ratePerGram]));

  const byLocation = new Map<string, StockBreakdownRow>();
  const byMetal = new Map<string, StockBreakdownRow>();
  const byPurity = new Map<string, StockBreakdownRow>();
  let cost = 0;
  let availablePieces = 0;
  let reservedPieces = 0;
  let reservedFine = 0;
  let metalValue = 0;
  let valuedGroups = 0;
  const missing = new Set<string>();

  const add = (row: StockBreakdownRow, g: Group) => {
    row.pieces += g.pieces;
    row.netWeight += g.netWeight;
    row.fineWeight += g.fineWeight;
    row.cost += g.cost;
    row.availablePieces += g.available;
  };
  const rowFor = (map: Map<string, StockBreakdownRow>, key: string, make: () => StockBreakdownRow) => map.get(key) ?? map.set(key, make()).get(key)!;

  for (const g of groups) {
    const metal = metalById.get(id(g._id.metalId));
    const metalName = metal?.name ?? "Unknown metal";
    const location = locationById.get(id(g._id.locationId));
    add(rowFor(byLocation, id(g._id.locationId), () => empty(id(g._id.locationId), location?.name ?? "Unknown location", location?.type.replace(/_/g, " ").toLowerCase())), g);
    add(rowFor(byMetal, id(g._id.metalId), () => empty(id(g._id.metalId), metalName)), g);
    add(rowFor(byPurity, rateKey(g._id.metalId, g._id.purity), () => empty(rateKey(g._id.metalId, g._id.purity), `${metalName} ${g._id.purity}`)), g);
    cost += g.cost;
    availablePieces += g.available;
    reservedPieces += g.reservedPieces;
    reservedFine += g.reservedFine;

    // Indicative metal value: this purity's own rate if quoted, else the metal's newest quote for another purity, scaled by fineness
    // — the same rule the piece detail screen uses (business-rules.md §2.14). No making, stones or tax: an asset figure, not a price.
    const fineness = (code: string) => metal?.purityOptions.find((o) => o.code === code)?.fineness;
    let quoted: { purity: string; rate: number } | undefined;
    const own = rateByKey.get(rateKey(g._id.metalId, g._id.purity));
    if (own !== undefined) quoted = { purity: g._id.purity, rate: own };
    else for (const [key, rate] of rateByKey) if (key.startsWith(`${id(g._id.metalId)}:`) && fineness(key.split(":")[1]!) !== undefined) { quoted = { purity: key.split(":")[1]!, rate }; break; }
    const quotedFineness = quoted ? fineness(quoted.purity) : undefined;
    if (g.fineWeight > 0 && quoted && quotedFineness) { metalValue += valueOfMetal({ weight: r3(g.fineWeight), fineness: 1, ratePerGram: quoted.rate, quotedFineness }); valuedGroups++; }
    else if (g.fineWeight > 0) missing.add(metalName);
  }

  const finish = (map: Map<string, StockBreakdownRow>) =>
    [...map.values()].map((r) => ({ ...r, netWeight: r3(r.netWeight), fineWeight: r3(r.fineWeight) })).sort((a, b) => b.fineWeight - a.fineWeight || b.pieces - a.pieces || a.label.localeCompare(b.label));
  const metalRows = finish(byMetal);

  return {
    metals: metalRows.map((r) => ({ ...r, code: metalById.get(r.key)?.code ?? "?" })),
    availablePieces,
    reserved: { pieces: reservedPieces, fineWeight: r3(reservedFine) },
    stockValue: { cost, metalValue: valuedGroups === 0 && missing.size > 0 ? null : metalValue, metalValueMissingFor: [...missing].sort() },
    byLocation: finish(byLocation),
    byMetal: metalRows,
    byPurity: finish(byPurity),
  };
}
