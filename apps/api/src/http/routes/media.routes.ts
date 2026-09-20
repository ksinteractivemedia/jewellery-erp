import { Router, type RequestHandler } from "express";
import multer from "multer";
import { PERMISSIONS } from "@jewellery/types";
import { IMAGE_KEY_PATTERN, MAX_IMAGE_BYTES } from "@jewellery/validation";
import { AUDIT_ACTIONS } from "../../modules/audit/audit.service";
import { auditCatalog } from "../../modules/catalog/catalog-audit";
import type { MediaService } from "../../modules/media/media.service";
import { DomainValidationError, NotFoundError } from "../../shared/errors";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/authorize";

export function createMediaRouter(deps: { authenticate: RequestHandler; media: MediaService }) {
  const { media } = deps;
  const router = Router();
  // One file per request, held in memory only long enough to validate and hand to storage.
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 } });

  router.post("/images", deps.authenticate, requirePermission(PERMISSIONS.CATALOG_MANAGE), upload.single("file"), asyncHandler(async (req, res) => {
    if (!req.file) throw new DomainValidationError('Attach the image as multipart field "file"');
    const uploaded = await media.uploadImage(req.file.buffer);
    await auditCatalog(req.auth!, req.ctx, AUDIT_ACTIONS.MEDIA_UPLOADED, "media", uploaded.key, { contentType: uploaded.contentType, size: uploaded.size });
    res.status(201).json({ key: uploaded.key, url: media.urlFor(uploaded.key), contentType: uploaded.contentType, size: uploaded.size });
  }));

  /**
   * Public, like a CDN: catalogue imagery is meant for the storefronts too, and `<img>` can't
   * send a bearer token. Keys are unguessable UUIDs and immutable, hence the long cache.
   * Content-Type comes from the stored extension, never from the client.
   */
  router.get("/*", asyncHandler(async (req, res) => {
    const key = (req.params as Record<string, string>)[0] ?? "";
    if (!IMAGE_KEY_PATTERN.test(key)) throw new NotFoundError("Media", key);
    const object = await media.get(key);
    if (!object) throw new NotFoundError("Media", key);
    res.set({
      "Content-Type": object.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Content-Type-Options": "nosniff",
    });
    res.send(object.bytes);
  }));

  return router;
}
