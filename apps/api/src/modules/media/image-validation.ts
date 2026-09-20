import { DomainValidationError } from "../../shared/errors";

export interface DetectedImage {
  ext: "png" | "jpg" | "webp";
  contentType: string;
}

/**
 * Identifies an image by its leading bytes. The client-supplied filename and Content-Type are
 * never trusted: they decide nothing here. Only PNG, JPEG and WebP are accepted — SVG is
 * refused on purpose (it is script-capable markup, not a raster image).
 */
export function detectImage(bytes: Buffer): DetectedImage | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: "png", contentType: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return { ext: "webp", contentType: "image/webp" };
  }
  return null;
}

export function requireImage(bytes: Buffer): DetectedImage {
  const detected = detectImage(bytes);
  if (!detected) throw new DomainValidationError("Unsupported image — upload a PNG, JPEG or WebP file");
  return detected;
}
