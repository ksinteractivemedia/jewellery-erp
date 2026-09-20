import { describe, expect, it } from "vitest";
import { JPEG, PNG, WEBP } from "../../../test/fixtures";
import { DomainValidationError } from "../../shared/errors";
import { detectImage, requireImage } from "./image-validation";
import { createLocalDiskStorage, createMemoryStorage } from "./storage";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("detectImage", () => {
  it("recognises PNG, JPEG and WebP by their bytes", () => {
    expect(detectImage(PNG)).toEqual({ ext: "png", contentType: "image/png" });
    expect(detectImage(JPEG)).toEqual({ ext: "jpg", contentType: "image/jpeg" });
    expect(detectImage(WEBP)).toEqual({ ext: "webp", contentType: "image/webp" });
  });

  it.each([
    ["SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["HTML", Buffer.from("<!doctype html><script>alert(1)</script>")],
    ["GIF", Buffer.from("GIF89a....")],
    ["a RIFF that is not WebP (WAV)", Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")])],
    ["empty", Buffer.alloc(0)],
    ["a truncated PNG signature", PNG.subarray(0, 5)],
  ])("rejects %s", (_name, bytes) => {
    expect(detectImage(bytes)).toBeNull();
    expect(() => requireImage(bytes)).toThrow(DomainValidationError);
  });
});

describe("storage adapters", () => {
  it("memory storage round-trips and reports existence", async () => {
    const s = createMemoryStorage();
    expect(await s.exists("products/a.png")).toBe(false);
    await s.put("products/a.png", { bytes: PNG, contentType: "image/png" });
    expect(await s.exists("products/a.png")).toBe(true);
    expect((await s.get("products/a.png"))!.bytes.equals(PNG)).toBe(true);
    expect(await s.get("products/missing.png")).toBeNull();
  });

  it("local disk storage round-trips and refuses keys that could escape its root", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "media-test-"));
    try {
      const s = createLocalDiskStorage(dir);
      await s.put("products/a.png", { bytes: PNG, contentType: "image/png" });
      expect((await s.get("products/a.png"))!.contentType).toBe("image/png");
      expect(await s.get("products/none.png")).toBeNull();
      for (const bad of ["../escape.png", "products/../../escape.png", "/abs/path.png", "products/a.exe"]) {
        await expect(s.put(bad, { bytes: PNG, contentType: "image/png" }), bad).rejects.toThrow(/unsafe/);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
