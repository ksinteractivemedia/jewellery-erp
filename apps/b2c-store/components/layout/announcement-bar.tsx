import Link from "next/link";
import type { StoreContent } from "@jewellery/types";

/** A slim message above the header — shown only if the business has written one. */
export function AnnouncementBar({ announcements }: { announcements: StoreContent["announcements"] }) {
  const a = announcements[0];
  if (!a) return null;
  const inner = <span className="text-[0.625rem] font-medium uppercase leading-relaxed tracking-[0.12em] sm:text-[0.6875rem] sm:tracking-[0.18em]">{a.text}</span>;
  return (
    <div className="bg-[var(--palette-charcoal)] px-4 py-2.5 text-center text-[var(--palette-offwhite)]" data-testid="announcement">
      {a.href ? <Link href={a.href} className="hover:underline underline-offset-4">{inner}</Link> : inner}
    </div>
  );
}
