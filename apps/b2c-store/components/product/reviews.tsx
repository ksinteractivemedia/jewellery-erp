"use client";

import { MessageSquare } from "lucide-react";
import { useReviews } from "../../lib/queries";

/**
 * Reviews. There is no reviews module yet, so the API says so (`NOT_CONNECTED`) and this section says "no reviews yet".
 * It never shows stars, a rating or a count it does not have, and never invents a testimonial.
 */
export function ReviewsSection({ heading = "Reviews", compact }: { heading?: string; compact?: boolean }) {
  const { data } = useReviews();
  if (data && data.status !== "NOT_CONNECTED") return null; // (a reviews module will render its list here)
  return (
    <div className={compact ? "flex flex-col items-center gap-3 text-center" : "flex flex-col gap-4"} data-testid="reviews">
      <h2 className="heading-display text-h2">{heading}</h2>
      <div className="flex items-center gap-3 text-muted"><MessageSquare className="h-5 w-5" aria-hidden="true" /><p className="text-body" data-testid="no-reviews">No reviews yet.</p></div>
    </div>
  );
}
