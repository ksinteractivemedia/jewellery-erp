import type { OrderStatus, StoreOrder, StoreOrderPayment } from "@jewellery/types";
import type { MediaService } from "../media/media.service";
import type { OrderDocument } from "./order.model";
import type { PaymentAttrs } from "./payment.model";
import { CUSTOMER_CANCELLABLE } from "./order-status";
import { PriceSnapshotModel } from "./price-snapshot.model";

type PaymentLike = Pick<PaymentAttrs, "status" | "amount" | "refundedAmount" | "failureReason"> & { id: string };

/**
 * An order as its customer sees it. The frozen figures come from the order and its price snapshots — never from a fresh
 * calculation, so an order looks the same next month whatever the gold rate does.
 */
export async function toStoreOrder(order: OrderDocument, payment: PaymentLike | null, media: MediaService, now: Date): Promise<StoreOrder> {
  const snapshots = new Map((await PriceSnapshotModel.find({ orderId: order._id }).lean()).map((s) => [String(s._id), s]));
  const holding = (["PENDING_PAYMENT", "PAYMENT_FAILED"] as OrderStatus[]).includes(order.status) && !!order.holdExpiresAt && order.holdExpiresAt > now;
  const orderPayment: StoreOrderPayment | undefined = payment ? { id: payment.id, status: payment.status, amount: payment.amount, refundedAmount: payment.refundedAmount, ...(payment.failureReason ? { failureReason: payment.failureReason } : {}) } : undefined;
  return {
    orderNo: order.orderNo,
    status: order.status,
    placedAt: order.placedAt.toISOString(),
    ...(holding && order.holdExpiresAt ? { holdExpiresAt: order.holdExpiresAt.toISOString() } : {}),
    customer: { fullName: order.customer.fullName, email: order.customer.email, phone: order.customer.phone },
    shippingAddress: { line1: order.shippingAddress.line1, ...(order.shippingAddress.line2 ? { line2: order.shippingAddress.line2 } : {}), city: order.shippingAddress.city, state: order.shippingAddress.state, postalCode: order.shippingAddress.postalCode },
    delivery: { code: order.delivery.code, label: order.delivery.label, fee: order.delivery.fee, ...(order.delivery.estimate ? { estimate: order.delivery.estimate } : {}) },
    items: order.items.map((i) => {
      const snap = snapshots.get(String(i.priceSnapshotId));
      const inputs = snap?.inputs as { metalName: string; purity: string; netWeight: number; ratePerGram: number; rateEffectiveFrom: string } | undefined;
      return {
        id: String(i._id),
        slug: i.slug,
        ...(i.variantSku ? { variantSku: i.variantSku } : {}),
        sku: i.sku,
        name: i.name,
        ...(i.imageKey ? { image: { url: media.urlFor(i.imageKey), alt: i.imageAlt ?? i.name } } : {}),
        ...(i.variantLabel ? { variantLabel: i.variantLabel } : {}),
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
        taxableValue: i.taxableValue,
        gst: i.gst,
        pricedWith: { metalName: inputs?.metalName ?? "", purity: inputs?.purity ?? "", netWeight: inputs?.netWeight ?? 0, ratePerGram: inputs?.ratePerGram ?? 0, rateEffectiveFrom: inputs?.rateEffectiveFrom ?? "", computedAt: snap?.computedAt.toISOString() ?? "" },
      };
    }),
    totals: { taxableValue: order.totals.taxableValue, gst: order.totals.gst, deliveryFee: order.totals.deliveryFee, total: order.totals.total },
    supplyType: order.supplyType,
    ...(orderPayment ? { payment: orderPayment } : {}),
    ...(order.cancelReason ? { cancelReason: order.cancelReason } : {}),
    canPay: holding,
    canCancel: (CUSTOMER_CANCELLABLE as readonly OrderStatus[]).includes(order.status),
  };
}
