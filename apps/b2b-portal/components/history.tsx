import type { B2BHistoryEntry } from "@jewellery/types";
import { dateTime } from "../lib/money";

export function History({ entries }: { entries: B2BHistoryEntry[] }) {
  return (
    <ol className="flex flex-col gap-2 border-l border-border pl-4" aria-label="History" data-testid="history">
      {[...entries].reverse().map((h, i) => (
        <li key={i} className="relative text-[0.8125rem]"><i className="absolute -left-[1.3125rem] top-1.5 h-2 w-2 rounded-full bg-foreground" aria-hidden="true" /><span className="font-medium">{h.status.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span> <span className="text-muted">· {dateTime(h.at)}{h.by === "SELLER" ? " · Suvarna" : h.by === "CUSTOMER" ? ` · ${h.actorName ?? "You"}` : ""}</span>{h.note && <p className="text-muted">{h.note}</p>}</li>
      ))}
    </ol>
  );
}
