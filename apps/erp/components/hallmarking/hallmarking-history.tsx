"use client";

import { useItemHallmarkingHistory } from "../../lib/api/hallmarking";
import { Load, Status, Table, Td, Th, day } from "./shared";

/** Every trip this piece has made through hallmarking, newest first — what the Inventory Item Detail screen must show as "Hallmarking History". */
export function HallmarkingHistory({ itemId }: { itemId: string }) {
  const q = useItemHallmarkingHistory(itemId);
  const batches = q.data ?? [];
  return (
    <Load q={q} rows={2}>
      {batches.length === 0 ? (
        <p className="text-body-sm text-muted" data-testid="hallmarking-history-empty">This piece has never been sent for hallmarking.</p>
      ) : (
        <Table testId="hallmarking-history"><thead><tr><Th>Batch</Th><Th>Centre</Th><Th>Sent</Th><Th>HUID</Th><Th>Certificate</Th><Th>Status</Th></tr></thead><tbody>
          {batches.map((b) => {
            const line = b.lines.find((l) => l.itemId === itemId);
            return (
              <tr key={b.id} data-testid="hallmarking-history-row">
                <Td className="font-medium">{b.hallmarkingNo}</Td>
                <Td>{b.assayingCentre.name}</Td>
                <Td>{b.sentDate ? day(b.sentDate) : "—"}</Td>
                <Td className="font-mono">{line?.huid ?? "—"}</Td>
                <Td className="text-muted">{line?.certificateNumber ?? "—"}{line?.hallmarkDate && ` · ${day(line.hallmarkDate)}`}</Td>
                <Td>{line ? <Status s={line.effectiveStatus} /> : <Status s={b.status} />}{line?.failureReason && <span className="block text-caption text-danger">{line.failureReason}</span>}</Td>
              </tr>
            );
          })}
        </tbody></Table>
      )}
    </Load>
  );
}
