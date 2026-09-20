import Link from "next/link";
import { StoreFooter } from "@jewellery/ui";
import { FOOTER_COLUMNS } from "../lib/placeholder-data";

export function SiteFooter() {
  return (
    <StoreFooter
      logo="Suvarna Wholesale"
      tagline="Wholesale pricing for registered retailers and distributors."
      columns={FOOTER_COLUMNS}
      renderLink={(href, label) => (
        <Link href={href} className="text-body-sm text-muted hover:text-foreground">
          {label}
        </Link>
      )}
      bottomNote="© 2026 Suvarna Jewellers. Wholesale accounts only."
    />
  );
}
