"use client";

import * as React from "react";
import type { PermissionKey } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { ForbiddenState } from "./forbidden-state";

/**
 * Route/section guard for the UI. Hides content the user can't use — but the data behind it
 * is protected by the API regardless, so bypassing this in devtools gets an attacker an
 * empty page and a 403, not the data.
 */
export function RequirePermission({
  permission,
  anyOf,
  fallback,
  children,
}: {
  permission?: PermissionKey;
  anyOf?: PermissionKey[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { can, canAny } = useAuth();
  const allowed = permission ? can(permission) : anyOf ? canAny(anyOf) : true;
  return <>{allowed ? children : (fallback ?? <ForbiddenState permission={permission ?? anyOf?.join(" or ")} />)}</>;
}
