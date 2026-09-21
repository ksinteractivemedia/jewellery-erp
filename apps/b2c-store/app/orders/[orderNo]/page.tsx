import type { Metadata } from "next";
import { OrderView } from "../../../components/checkout/order-view";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

export default function OrderPage({ params }: { params: { orderNo: string } }) {
  return (
    <div className="container-page flex flex-col gap-10 pb-24 pt-8 sm:pt-12">
      <h1 className="heading-display text-h1 sm:text-display">Your order</h1>
      <OrderView orderNo={decodeURIComponent(params.orderNo)} />
    </div>
  );
}
