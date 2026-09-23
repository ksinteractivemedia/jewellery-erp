import type { AuthSession } from "@jewellery/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
  }
}

/**
 * The access token lives ONLY in this module's memory (never localStorage), so an XSS cannot lift it out of storage and it dies with
 * the tab. The long-lived credential is the httpOnly refresh cookie, which JavaScript cannot read.
 */
let accessToken: string | null = null;
const lostListeners = new Set<() => void>();
export const onSessionLost = (cb: () => void) => (lostListeners.add(cb), () => void lostListeners.delete(cb));

async function toError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  const issues: { path?: string; message: string }[] = Array.isArray(body?.error?.issues) ? body.error.issues : [];
  const detail = issues.slice(0, 3).map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ");
  const message: string = body?.error?.message ?? `Request failed (${res.status})`;
  return new ApiError(res.status, body?.error?.code ?? "ERROR", detail ? `${message} — ${detail}` : message, body?.error?.details);
}

const raw = (path: string, init: RequestInit = {}, withToken = true) => {
  const headers = new Headers(init.headers);
  // FormData must go out without a content-type so the browser adds the multipart boundary.
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (withToken && accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include", cache: "no-store" });
};

let refreshing: Promise<AuthSession | null> | null = null;
/** Refresh tokens are single-use, so overlapping refreshes must share one request (and one lock across tabs). */
export function refreshSession(): Promise<AuthSession | null> {
  refreshing ??= (async () => {
    const run = async () => {
      const res = await raw("/api/auth/refresh", { method: "POST" }, false);
      if (!res.ok) return null;
      const session = (await res.json()) as AuthSession;
      accessToken = session.accessToken;
      return session;
    };
    try {
      const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
      return locks ? await locks.request("jerp-portal-refresh", run) : await run();
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Authenticated JSON call: on a 401 refresh once and retry; if that fails the session is over. (Convenience only — the API authorizes every request itself.) */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init);
  if (res.status === 401) {
    if (!(await refreshSession())) {
      accessToken = null;
      lostListeners.forEach((cb) => cb());
      throw await toError(res);
    }
    res = await raw(path, init);
  }
  if (!res.ok) throw await toError(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const put = <T,>(path: string, body: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const del = <T,>(path: string) => api<T>(path, { method: "DELETE" });
export const postFile = <T,>(path: string, file: File) => { const fd = new FormData(); fd.set("file", file); return api<T>(path, { method: "POST", body: fd }); };
/** Downloads a private, authorised file (an attachment) — never a public URL — and hands it to the browser as a save. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  let res = await raw(path);
  if (res.status === 401) { if (!(await refreshSession())) throw await toError(res); res = await raw(path); }
  if (!res.ok) throw await toError(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const res = await raw("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false);
  if (!res.ok) throw await toError(res);
  const session = (await res.json()) as AuthSession;
  accessToken = session.accessToken;
  return session;
}
export async function logout(): Promise<void> {
  try {
    await raw("/api/auth/logout", { method: "POST" });
  } finally {
    accessToken = null;
  }
}
