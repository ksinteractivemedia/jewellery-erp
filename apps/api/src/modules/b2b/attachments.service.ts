import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Types } from "mongoose";
import type { B2BAttachment } from "@jewellery/types";
import { ConflictError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { PurchaseOrderModel, type PurchaseOrderDocument } from "./b2b.models";
import { audit, oid, type Actor } from "./b2b-store";

/** Where the bytes of a PRIVATE document live. Nothing here is ever served from a public URL: downloads go through an authorised route. */
export interface DocumentStorage {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}
const SAFE_KEY = /^b2b\/po\/[0-9a-f]{24}\/[0-9a-f]{24}$/;
const assertKey = (k: string) => {
  if (!SAFE_KEY.test(k)) throw new Error(`unsafe document key: ${k}`);
};
export function createMemoryDocumentStorage(): DocumentStorage & { size(): number } {
  const m = new Map<string, Buffer>();
  return { async put(k, b) { assertKey(k); m.set(k, b); }, async get(k) { assertKey(k); return m.get(k) ?? null; }, async delete(k) { assertKey(k); m.delete(k); }, size: () => m.size };
}
export function createLocalDiskDocumentStorage(rootDir: string): DocumentStorage {
  const root = path.resolve(rootDir);
  const at = (k: string) => { assertKey(k); const full = path.resolve(root, k); if (!full.startsWith(root + path.sep)) throw new Error("unsafe document key"); return full; };
  return {
    async put(k, b) { const f = at(k); await mkdir(path.dirname(f), { recursive: true }); await writeFile(f, b); },
    async get(k) { try { return await readFile(at(k)); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; } },
    async delete(k) { await rm(at(k), { force: true }); },
  };
}

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** What the bytes really are — decided from the content, never from the client's claim. */
export function sniff(bytes: Buffer, filename: string): string | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x50, 0x4b, 0x03, 0x04) && /\.xlsx$/i.test(filename)) return XLSX;
  if (/\.csv$/i.test(filename) && !bytes.subarray(0, 4096).includes(0)) return "text/csv";
  return null;
}
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", [XLSX]: "xlsx", "text/csv": "csv" };
export const cleanName = (n: string) => n.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim().slice(0, 120) || "attachment";

const EDITABLE = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATION"];

/** Files attached to a purchase order — the customer's own PO document, mostly. Private, size- and type-limited, audited. */
export function createAttachmentService(deps: { storage: DocumentStorage; now?: () => Date }) {
  const { storage } = deps;
  const clock = deps.now ?? (() => new Date());
  const view = (a: PurchaseOrderDocument["attachments"][number]): B2BAttachment => ({ id: String(a._id), name: a.name, mimeType: a.mimeType, size: a.size, uploadedAt: a.uploadedAt.toISOString(), uploadedBy: a.uploadedBy, ...(a.uploadedByName ? { uploadedByName: a.uploadedByName } : {}) });

  return {
    async add(po: PurchaseOrderDocument, actor: Actor, file: { originalname: string; buffer: Buffer }): Promise<B2BAttachment> {
      const allowed = actor.kind === "SELLER" ? [...EDITABLE, "APPROVED"] : EDITABLE;
      if (!allowed.includes(po.status)) throw new ConflictError(`Files can't be added to a purchase order that is ${po.status.replace(/_/g, " ").toLowerCase()}.`);
      if (po.attachments.length >= MAX_ATTACHMENTS) throw new ConflictError(`A purchase order can carry at most ${MAX_ATTACHMENTS} files.`);
      if (file.buffer.length === 0) throw new DomainValidationError("That file is empty.");
      if (file.buffer.length > MAX_ATTACHMENT_BYTES) throw new DomainValidationError("Files can be at most 5 MB.");
      const name = cleanName(file.originalname);
      const mimeType = sniff(file.buffer, name);
      if (!mimeType) throw new DomainValidationError("Attach a PDF, PNG, JPEG, XLSX or CSV file.");
      const id = new Types.ObjectId();
      const key = `b2b/po/${po.id}/${id.toHexString()}`;
      await storage.put(key, file.buffer);
      const record = { _id: id, name: /\.[a-z0-9]{2,4}$/i.test(name) ? name : `${name}.${EXT[mimeType]}`, mimeType, size: file.buffer.length, key, uploadedAt: clock(), uploadedBy: actor.kind, uploadedById: oid(actor.id), uploadedByName: actor.name };
      const updated = await PurchaseOrderModel.findOneAndUpdate({ _id: po._id, status: { $in: allowed }, $expr: { $lt: [{ $size: "$attachments" }, MAX_ATTACHMENTS] } }, { $push: { attachments: record } }, { new: true });
      if (!updated) {
        await storage.delete(key);
        throw new ConflictError("This purchase order changed — please look again.");
      }
      await audit(actor, AUDIT_ACTIONS.B2B_ATTACHMENT_ADDED, "PurchaseOrder", po.id, { poNo: po.poNo, name: record.name, size: record.size, mimeType });
      return view(updated.attachments.find((a) => String(a._id) === id.toHexString())!);
    },

    async remove(po: PurchaseOrderDocument, attachmentId: string, actor: Actor): Promise<void> {
      const a = Types.ObjectId.isValid(attachmentId) ? po.attachments.find((x) => String(x._id) === attachmentId) : undefined;
      if (!a) throw new NotFoundError("Attachment", attachmentId);
      if (a.uploadedBy !== actor.kind) throw new ConflictError("You can only remove files you added yourself.");
      if (!EDITABLE.includes(po.status)) throw new ConflictError(`Files can't be removed from a purchase order that is ${po.status.replace(/_/g, " ").toLowerCase()}.`);
      const res = await PurchaseOrderModel.updateOne({ _id: po._id, status: { $in: EDITABLE } }, { $pull: { attachments: { _id: a._id } } });
      if (!res.modifiedCount) throw new ConflictError("This purchase order changed — please look again.");
      await storage.delete(a.key);
      await audit(actor, AUDIT_ACTIONS.B2B_ATTACHMENT_REMOVED, "PurchaseOrder", po.id, { poNo: po.poNo, name: a.name });
    },

    /** The bytes, for an authorised download. */
    async read(po: PurchaseOrderDocument, attachmentId: string): Promise<{ bytes: Buffer; name: string; mimeType: string }> {
      const a = Types.ObjectId.isValid(attachmentId) ? po.attachments.find((x) => String(x._id) === attachmentId) : undefined;
      if (!a) throw new NotFoundError("Attachment", attachmentId);
      const bytes = await storage.get(a.key);
      if (!bytes) throw new NotFoundError("Attachment", attachmentId);
      return { bytes, name: a.name, mimeType: a.mimeType };
    },
  };
}
export type AttachmentService = ReturnType<typeof createAttachmentService>;
