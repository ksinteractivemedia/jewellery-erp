import { deflateSync } from "node:zlib";

/**
 * DEVELOPMENT ONLY. Generates small valid PNGs (a soft radial gradient with a ring, tinted per
 * metal) so the ERP has real image bytes to upload, serve and render without shipping binary
 * fixtures or fetching anything from the network.
 */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};

export type Rgb = [number, number, number];
export const TINTS: Record<string, Rgb> = { GOLD: [222, 170, 60], SILVER: [176, 182, 190], PLATINUM: [150, 160, 176] };

/** `variant` (0..n) shifts the ring so a product's several images differ from each other. */
export function placeholderPng(tint: Rgb, variant = 0, size = 320): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const cx = size / 2;
  const ringR = size * (0.24 + variant * 0.04);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cx) / cx; // 0 centre → ~1.4 corner
      const bg = 1 - Math.min(1, d) * 0.28; // soft vignette over a warm ivory ground
      let [r, g, b] = [247 * bg, 245 * bg, 242 * bg];
      const ring = Math.abs(Math.hypot(x - cx, y - cx) - ringR);
      const thickness = size * 0.045;
      if (ring < thickness) {
        const shade = 0.72 + 0.28 * Math.cos(((x + y) / size) * Math.PI * 2 + variant); // catches the light
        const edge = 1 - Math.max(0, ring - thickness * 0.6) / (thickness * 0.4);
        const a = Math.min(1, Math.max(0, edge));
        r = r * (1 - a) + tint[0] * shade * a;
        g = g * (1 - a) + tint[1] * shade * a;
        b = b * (1 - a) + tint[2] * shade * a;
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round(r);
      raw[o + 1] = Math.round(g);
      raw[o + 2] = Math.round(b);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
