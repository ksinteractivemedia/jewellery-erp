import { Suspense } from "react";
import { LedgerView } from "../../../../components/inventory/ledger-view";

export default function LedgerPage() {
  return (
    <Suspense>
      <LedgerView />
    </Suspense>
  );
}
