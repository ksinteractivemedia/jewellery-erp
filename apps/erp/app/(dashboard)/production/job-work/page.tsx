import { Suspense } from "react";
import { JobWorkView } from "../../../../components/manufacturing/job-work-view";

// useSearchParams() (deep-linking to one order, e.g. from Reconciliation) needs a Suspense boundary for static rendering.
export default function Page() {
  return (
    <Suspense>
      <JobWorkView />
    </Suspense>
  );
}
