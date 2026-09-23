import type { MediaService } from "../media/media.service";
import { createAttachmentService, createMemoryDocumentStorage, type DocumentStorage } from "./attachments.service";
import { createB2BReads } from "./b2b-reads.service";
import { createFulfilmentService } from "./fulfilment.service";
import { createB2BPaymentService } from "./payments.service";
import { createProcurementService } from "./procurement.service";

export * from "./b2b.models";
export * from "./b2b-status";
export * from "./credit";
export type { Actor } from "./b2b-store";
export { createLocalDiskDocumentStorage, createMemoryDocumentStorage, type DocumentStorage } from "./attachments.service";

/** The wholesale module: procurement (PO → quotation → sales order, with the credit rule), fulfilment (allocate, invoice), offline payments, and the read models both the portal and the ERP use. */
export function createB2BModule(deps: { media: MediaService; documents?: DocumentStorage; now?: () => Date }) {
  const base = { ...(deps.now ? { now: deps.now } : {}) };
  const procurement = createProcurementService({ media: deps.media, ...base });
  return {
    procurement,
    fulfilment: createFulfilmentService(base),
    payments: createB2BPaymentService(base),
    attachments: createAttachmentService({ storage: deps.documents ?? createMemoryDocumentStorage(), ...base }),
    reads: createB2BReads({ media: deps.media, ...base, refresh: () => procurement.expireStale() }),
  };
}
export type B2BModule = ReturnType<typeof createB2BModule>;
