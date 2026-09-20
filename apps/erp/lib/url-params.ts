"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Patch<T> = Partial<Record<keyof T & string, string | number | boolean | undefined>>;

/**
 * List state that lives in the URL: a filtered/sorted/paged view survives reload and back/forward and
 * can be shared as a link. `parse` turns the raw query string into typed params (the callers use the same
 * Zod schema the API validates with, falling back to defaults for a hand-edited URL); values equal to a
 * default are dropped from the URL, and changing any *filter* resets to page 1.
 */
export function useUrlParams<T extends object>(opts: {
  parse: (raw: Record<string, string>) => T;
  defaults: Record<string, unknown>;
  filterKeys: readonly string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { parse, defaults, filterKeys } = opts;

  const params = React.useMemo(() => parse(Object.fromEntries(search.entries())), [search, parse]);

  const setParams = React.useCallback(
    (patch: Patch<T>) => {
      const next = new URLSearchParams(search.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "" || (key in defaults && value === defaults[key])) next.delete(key);
        else next.set(key, String(value));
      }
      if (Object.keys(patch).some((k) => filterKeys.includes(k)) && !("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, search, defaults, filterKeys]
  );

  const clearFilters = React.useCallback(() => setParams(Object.fromEntries(filterKeys.map((k) => [k, undefined])) as Patch<T>), [setParams, filterKeys]);
  return { params, setParams, clearFilters, search };
}
