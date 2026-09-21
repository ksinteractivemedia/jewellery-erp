/**
 * A tiny external store persisted to localStorage, for the bag and the wishlist. It exists so React can read it with
 * `useSyncExternalStore` (server render sees the empty value; the browser then sees the saved one), it survives a
 * reload and stays in step across tabs, and it degrades to memory when storage is unavailable (private mode, blocked
 * cookies). It holds a shopper's choices only — never a price, which always comes from the API.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createPersistentStore<T>(opts: { key: string; empty: T; parse: (raw: unknown) => T; storage?: StorageLike | null }) {
  const listeners = new Set<() => void>();
  const storage = opts.storage === undefined ? (typeof window === "undefined" ? null : safeLocalStorage()) : opts.storage;
  let value: T = opts.empty;
  let loaded = false;

  const load = () => {
    if (loaded) return;
    loaded = true;
    try {
      const raw = storage?.getItem(opts.key);
      if (raw) value = opts.parse(JSON.parse(raw));
    } catch {
      value = opts.empty; // corrupt or unreadable: start clean rather than crash the page
    }
  };
  const emit = () => listeners.forEach((l) => l());

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key !== opts.key) return;
      loaded = false;
      load();
      emit();
    });
  }

  return {
    get: () => (load(), value),
    /** What the server (and the first client render) sees. */
    getServer: () => opts.empty,
    set(next: T) {
      load();
      value = next;
      try {
        storage?.setItem(opts.key, JSON.stringify(next));
      } catch {
        /* storage full or blocked — the value still lives in memory for this session */
      }
      emit();
    },
    update(fn: (current: T) => T) {
      this.set(fn(this.get()));
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

function safeLocalStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    s.getItem("__probe__");
    return s;
  } catch {
    return null;
  }
}
