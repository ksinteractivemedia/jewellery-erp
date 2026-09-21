/**
 * The one way the storefront talks to the backend. On the server it calls the API directly; in the browser it calls
 * its own origin, which Next forwards to the API (next.config.js) — so there is no CORS and no API address in the bundle.
 * The storefront computes nothing: prices, availability and totals all arrive from these endpoints.
 */
const SERVER_BASE = process.env.API_URL ?? "http://localhost:4000";

export class StoreApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** The API's machine-readable code (PRICE_CHANGED, STOCK_CHANGED …). */
    public readonly code?: string,
    /** Extra facts the API returned with the error — e.g. the fresh verification after PRICE_CHANGED. */
    public readonly details?: unknown
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new StoreApiError(res.status, body?.error?.message ?? `Request failed (${res.status})`, body?.error?.code, body?.error?.details);
  }
  return (await res.json()) as T;
}

/**
 * `revalidate` is for the SHELL only (navigation, editorial content), which may be a few seconds old. Everything else —
 * prices, availability, product lists — is fetched fresh on every request: Next's data cache serves stale-while-revalidate,
 * which would let a shopper see yesterday's gold rate in a price.
 */
export async function storeGet<T>(path: string, opts: { revalidate?: number; signal?: AbortSignal } = {}): Promise<T> {
  if (typeof window === "undefined") {
    return parse<T>(await fetch(`${SERVER_BASE}/api/store${path}`, opts.revalidate ? { next: { revalidate: opts.revalidate } } : { cache: "no-store" }));
  }
  return parse<T>(await fetch(`/api/store${path}`, { signal: opts.signal }));
}

export async function storePost<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  return parse<T>(await fetch(`/api/store${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
}

/** Reads that need the order's access token (a guest's proof the order is theirs). */
export async function storeGetAuthed<T>(path: string, token: string, opts: { signal?: AbortSignal } = {}): Promise<T> {
  return parse<T>(await fetch(`/api/store${path}`, { headers: { "x-order-token": token }, cache: "no-store", signal: opts.signal }));
}

/** Like `storeGet`, but a 404 becomes `null` so a page can call `notFound()`. */
export async function storeGetOrNull<T>(path: string): Promise<T | null> {
  try {
    return await storeGet<T>(path);
  } catch (error) {
    if (error instanceof StoreApiError && error.status === 404) return null;
    throw error;
  }
}
