import type { ActivityData } from "@jewellery/types";
import { UserModel } from "../auth/user.model";
import { ProductModel } from "../catalog/product.model";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import { InventoryLedgerModel } from "../inventory/inventory-ledger.model";
import { TransactionModel } from "../inventory/transaction.model";
import { LocationModel } from "../organization/location.model";
import type { ResolvedRange } from "./range";
import type { LocationScope } from "./scope";

const id = (v: unknown) => String(v);
const SYSTEM_USER = "0".repeat(24);
const LIMIT = 10;

/** The latest stock movements in the range and scope — straight off the immutable ledger. */
export async function loadActivity(scope: LocationScope, range: ResolvedRange): Promise<ActivityData> {
  const filter = {
    createdAt: { $gte: range.start, $lt: range.end },
    ...(scope.locationIds ? { $or: [{ sourceLocationId: { $in: scope.locationIds } }, { destinationLocationId: { $in: scope.locationIds } }] } : {}),
  };
  const [total, entries] = await Promise.all([InventoryLedgerModel.countDocuments(filter), InventoryLedgerModel.find(filter).sort({ createdAt: -1, _id: -1 }).limit(LIMIT).lean()]);

  const [transactions, items, locations] = await Promise.all([
    TransactionModel.find({ _id: { $in: entries.map((e) => e.transactionId) } }).select("performedBy").lean(),
    InventoryItemModel.find({ _id: { $in: entries.map((e) => e.itemId) } }).select("itemCode productId").lean(),
    LocationModel.find({ _id: { $in: entries.flatMap((e) => [e.sourceLocationId, e.destinationLocationId].filter(Boolean)) } }).select("name").lean(),
  ]);
  const [users, products] = await Promise.all([
    UserModel.find({ _id: { $in: transactions.map((t) => t.performedBy) } }).select("name").lean(),
    ProductModel.find({ _id: { $in: items.map((i) => i.productId).filter(Boolean) } }).select("name").lean(),
  ]);
  const actorOf = new Map(transactions.map((t) => [id(t._id), id(t.performedBy)]));
  const userName = new Map(users.map((u) => [id(u._id), u.name as string]));
  const itemOf = new Map(items.map((i) => [id(i._id), i]));
  const productName = new Map(products.map((p) => [id(p._id), p.name]));
  const locationName = new Map(locations.map((l) => [id(l._id), l.name]));

  return {
    total,
    rows: entries.map((e) => {
      const item = itemOf.get(id(e.itemId));
      const actorId = actorOf.get(id(e.transactionId));
      return {
        id: id(e._id),
        at: e.createdAt.toISOString(),
        movementType: e.movementType,
        itemId: id(e.itemId),
        itemCode: item?.itemCode ?? "?",
        ...(item?.productId ? { productName: productName.get(id(item.productId)) } : {}),
        actor: actorId === SYSTEM_USER ? "System" : (actorId && userName.get(actorId)) || "Unknown user",
        ...(e.sourceLocationId ? { from: locationName.get(id(e.sourceLocationId)) } : {}),
        ...(e.destinationLocationId ? { to: locationName.get(id(e.destinationLocationId)) } : {}),
      };
    }),
  };
}
