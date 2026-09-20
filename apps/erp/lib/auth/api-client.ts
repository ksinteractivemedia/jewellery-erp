import type { AuthSession } from "@jewellery/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/**
 * The access token lives ONLY in this module's memory — never localStorage/sessionStorage, so
 * an XSS can't lift it out of storage, and it dies with the tab. The long-lived credential is
 * the httpOnly refresh cookie, which JavaScript cannot read at all.
 */
let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

type Listener = () => void;
const sessionLostListeners = new Set<Listener>();
/** Fires when a request proves the session is gone (refresh failed) so the UI can drop to the login screen. */
export const onSessionLost = (cb: Listener) => {
  sessionLostListeners.add(cb);
  return () => void sessionLostListeners.delete(cb);
};

async function parseError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  return new ApiError(res.status, body?.error?.code ?? "ERROR", body?.error?.message ?? `Request failed (${res.status})`);
}

async function rawFetch(path: string, init: RequestInit = {}, withToken = true): Promise<Response> {
  const headers = new Headers(init.headers);
  // FormData must go out without a content-type so the browser adds the multipart boundary.
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (withToken && accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
}

let refreshInFlight: Promise<AuthSession | null> | null = null;

/**
 * Exchanges the refresh cookie for a new session. Single-flight in this tab (and serialized
 * across tabs with the Web Locks API when available): refresh tokens are single-use, so two
 * overlapping refreshes with the same cookie would look like token theft to the server and
 * sign the user out.
 */
export function refreshSession(): Promise<AuthSession | null> {
  refreshInFlight ??= (async () => {
    const run = async () => {
      const res = await rawFetch("/api/auth/refresh", { method: "POST" }, false);
      if (!res.ok) return null;
      const session = (await res.json()) as AuthSession;
      accessToken = session.accessToken;
      return session;
    };
    try {
      const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
      return locks ? await locks.request("jerp-refresh", run) : await run();
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * Authenticated JSON request. On a 401 it refreshes once and retries; if that fails the
 * session is over. This is a UX convenience only — the API authorizes every request itself.
 */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await rawFetch(path, init);
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      accessToken = null;
      sessionLostListeners.forEach((cb) => cb());
      throw await parseError(res);
    }
    res = await rawFetch(path, init);
  }
  if (!res.ok) throw await parseError(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// --- unauthenticated auth endpoints ---------------------------------------------------------

async function publicPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await rawFetch(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }, false);
  if (!res.ok) throw await parseError(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export async function loginRequest(email: string, password: string): Promise<AuthSession> {
  const session = await publicPost<AuthSession>("/api/auth/login", { email, password });
  accessToken = session.accessToken;
  return session;
}

export async function logoutRequest(): Promise<void> {
  try {
    await rawFetch("/api/auth/logout", { method: "POST" });
  } finally {
    accessToken = null;
  }
}

export const forgotPasswordRequest = (email: string) => publicPost<{ message: string }>("/api/auth/forgot-password", { email });
export const resetPasswordRequest = (token: string, newPassword: string) => publicPost<void>("/api/auth/reset-password", { token, newPassword });
