import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { AuthenticationError } from "../../shared/errors";
import { testConfig } from "../../../test/helpers";
import { generateOpaqueToken, parseOpaqueToken, secretMatches, signAccessToken, verifyAccessToken } from "./tokens";

const cfg = testConfig().auth;
const key = (s: string) => new TextEncoder().encode(s);
const claims = { userId: "64b0c0ffee0000000000abcd", sessionId: "64b0c0ffee0000000000dcba" };

describe("access tokens", () => {
  it("round-trips identity and session", async () => {
    const { token, expiresIn } = await signAccessToken(cfg, claims);
    expect(expiresIn).toBe(900);
    expect(await verifyAccessToken(cfg, token)).toEqual(claims);
  });

  it("does not embed roles or permissions (they are resolved live)", async () => {
    const { token } = await signAccessToken(cfg, claims);
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(Object.keys(payload).sort()).toEqual(["aud", "exp", "iat", "iss", "jti", "sid", "sub"]);
  });

  it("rejects an expired token with TOKEN_EXPIRED (so clients know to refresh)", async () => {
    const expired = await new SignJWT({ sid: claims.sessionId }).setProtectedHeader({ alg: "HS256" }).setSubject(claims.userId)
      .setIssuer(cfg.issuer).setAudience(cfg.audience).setIssuedAt(Math.floor(Date.now() / 1000) - 100).setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(key(cfg.accessSecret));
    await expect(verifyAccessToken(cfg, expired)).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
  });

  it("rejects a token signed with a different secret", async () => {
    const forged = await signAccessToken({ ...cfg, accessSecret: "another-secret-another-secret-another-1" }, claims);
    await expect(verifyAccessToken(cfg, forged.token)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects a tampered payload", async () => {
    const { token } = await signAccessToken(cfg, claims);
    const [h, p, s] = token.split(".");
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    payload.sub = "64b0c0ffee0000000000ffff";
    const tampered = `${h}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${s}`;
    await expect(verifyAccessToken(cfg, tampered)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects an `alg: none` token", async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: claims.userId, sid: claims.sessionId, iss: cfg.issuer, aud: cfg.audience, exp: Math.floor(Date.now() / 1000) + 600 })}.`;
    await expect(verifyAccessToken(cfg, none)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects a token for another audience or issuer", async () => {
    const other = await signAccessToken({ ...cfg, audience: "some-other-api" }, claims);
    await expect(verifyAccessToken(cfg, other.token)).rejects.toBeInstanceOf(AuthenticationError);
    const otherIss = await signAccessToken({ ...cfg, issuer: "someone-else" }, claims);
    await expect(verifyAccessToken(cfg, otherIss.token)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects garbage and tokens without a session id", async () => {
    await expect(verifyAccessToken(cfg, "not-a-jwt")).rejects.toBeInstanceOf(AuthenticationError);
    const noSid = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(claims.userId).setIssuer(cfg.issuer).setAudience(cfg.audience)
      .setExpirationTime("5m").sign(key(cfg.accessSecret));
    await expect(verifyAccessToken(cfg, noSid)).rejects.toBeInstanceOf(AuthenticationError);
  });
});

describe("opaque refresh/reset tokens", () => {
  const id = "64b0c0ffee0000000000abcd";

  it("stores only a hash and verifies the secret in constant time", () => {
    const { token, secretHash } = generateOpaqueToken(id);
    const parsed = parseOpaqueToken(token)!;
    expect(parsed.id).toBe(id);
    expect(token).not.toContain(secretHash);
    expect(secretMatches(parsed.secret, secretHash)).toBe(true);
    expect(secretMatches(parsed.secret + "x", secretHash)).toBe(false);
    expect(secretMatches(parsed.secret, undefined)).toBe(false);
  });

  it("generates high-entropy, unique tokens", () => {
    const a = generateOpaqueToken(id).token;
    const b = generateOpaqueToken(id).token;
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(60);
  });

  it("rejects malformed tokens", () => {
    for (const bad of [undefined, null, 42, "", "abc", `${id}`, `${id}.short`, `zzzzzzzzzzzzzzzzzzzzzzzz.${"a".repeat(43)}`, "x".repeat(300)]) {
      expect(parseOpaqueToken(bad)).toBeNull();
    }
  });
});
