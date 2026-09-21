import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@jewellery/ui";

/** An editorial section title: a small caps eyebrow over a serif heading, with an optional link to the whole set. */
export function SectionHeading({ eyebrow, title, description, href, linkLabel = "View all", className, align = "left" }: { eyebrow?: string; title: string; description?: string; href?: string; linkLabel?: string; className?: string; align?: "left" | "center" }) {
  return (
    <div className={cn("flex flex-col gap-3", align === "center" ? "items-center text-center" : "sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className={cn("flex max-w-2xl flex-col gap-3", align === "center" && "items-center")}>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2 className="heading-display text-h2 sm:text-h1">{title}</h2>
        {description && <p className="text-body text-muted">{description}</p>}
      </div>
      {href && (
        <Link href={href} className="group inline-flex items-center gap-2 text-[0.8125rem] font-medium uppercase tracking-[0.12em] text-foreground">
          <span className="link-quiet">{linkLabel}</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export const Section = ({ children, className, tone = "plain", id, label }: { children: React.ReactNode; className?: string; tone?: "plain" | "sunken" | "dark"; id?: string; label?: string }) => (
  <section id={id} aria-label={label} className={cn("py-14 sm:py-20", tone === "sunken" && "bg-surface-sunken", tone === "dark" && "bg-[var(--palette-charcoal)] text-[var(--palette-offwhite)]", className)}>
    <div className="container-page">{children}</div>
  </section>
);
