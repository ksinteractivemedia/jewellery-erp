import { describe, expect, it } from "vitest";
import { ALL_PERMISSION_KEYS, ALL_ROLE_NAMES, PERMISSIONS as P, ROLE_NAMES as R, type PermissionKey, type RoleName } from "@jewellery/types";
import { PERMISSION_DESCRIPTIONS } from "./permission-catalog";
import { DEFAULT_ROLE_MATRIX } from "./role-matrix";

const rolesHolding = (perm: PermissionKey) => ALL_ROLE_NAMES.filter((r) => DEFAULT_ROLE_MATRIX[r].includes(perm)).sort();

describe("permission catalog", () => {
  it("every permission is `module.action` and unique", () => {
    for (const key of ALL_PERMISSION_KEYS) expect(key).toMatch(/^[a-z0-9_]+\.[a-z0-9_]+$/);
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it("includes every permission named in the requirements", () => {
    const required = [
      "inventory.view", "inventory.create", "inventory.adjust", "inventory.transfer", "inventory.approve_adjustment",
      "sales.view", "sales.create", "sales.cancel", "sales.discount", "sales.override_price",
      "b2b.view", "b2b.create_po", "b2b.approve_po", "b2b.override_credit",
      "accounting.view", "accounting.create_payment", "reports.view", "settings.manage_users",
    ];
    for (const key of required) expect(ALL_PERMISSION_KEYS).toContain(key);
  });

  it("every permission has a description", () => {
    for (const key of ALL_PERMISSION_KEYS) expect(PERMISSION_DESCRIPTIONS[key]).toBeTruthy();
  });
});

describe("role matrix", () => {
  it("defines all 13 roles", () => {
    expect(ALL_ROLE_NAMES).toHaveLength(13);
    for (const role of ALL_ROLE_NAMES) expect(DEFAULT_ROLE_MATRIX[role]).toBeDefined();
  });

  it("only grants permissions that exist in the catalog, with no duplicates", () => {
    for (const role of ALL_ROLE_NAMES) {
      const perms = DEFAULT_ROLE_MATRIX[role];
      expect(new Set(perms).size).toBe(perms.length);
      for (const p of perms) expect(ALL_PERMISSION_KEYS).toContain(p);
    }
  });

  it("SUPER_ADMIN holds everything; ADMIN holds everything except role management", () => {
    expect(DEFAULT_ROLE_MATRIX[R.SUPER_ADMIN].sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
    expect(ALL_PERMISSION_KEYS.filter((k) => !DEFAULT_ROLE_MATRIX[R.ADMIN].includes(k))).toEqual([P.SETTINGS_MANAGE_ROLES]);
  });

  it("only SUPER_ADMIN can manage roles (the permission that stops ADMIN minting a SUPER_ADMIN)", () => {
    expect(rolesHolding(P.SETTINGS_MANAGE_ROLES)).toEqual([R.SUPER_ADMIN]);
  });

  it("settings.* is restricted to the two admin roles", () => {
    for (const role of ALL_ROLE_NAMES.filter((r) => r !== R.SUPER_ADMIN && r !== R.ADMIN)) {
      expect(DEFAULT_ROLE_MATRIX[role].filter((p) => p.startsWith("settings."))).toEqual([]);
    }
  });

  it("VIEWER is strictly read-only", () => {
    expect(DEFAULT_ROLE_MATRIX[R.VIEWER].length).toBeGreaterThan(0);
    for (const p of DEFAULT_ROLE_MATRIX[R.VIEWER]) expect(p).toMatch(/\.view$/);
  });

  it("separation of duties: approval and override permissions sit with the right owners only", () => {
    expect(rolesHolding(P.INVENTORY_APPROVE_ADJUSTMENT)).toEqual([R.ADMIN, R.INVENTORY_MANAGER, R.SUPER_ADMIN].sort());
    expect(rolesHolding(P.B2B_OVERRIDE_CREDIT)).toEqual([R.ADMIN, R.B2B_MANAGER, R.SUPER_ADMIN].sort());
    expect(rolesHolding(P.ACCOUNTING_CREATE_PAYMENT)).toEqual([R.ACCOUNTANT, R.ADMIN, R.SUPER_ADMIN].sort());
    expect(rolesHolding(P.SALES_OVERRIDE_PRICE)).toEqual([R.ADMIN, R.SALES_MANAGER, R.SUPER_ADMIN].sort());
  });

  it("SALES_EXECUTIVE can sell but cannot discount, override price, cancel or see accounting", () => {
    const perms = DEFAULT_ROLE_MATRIX[R.SALES_EXECUTIVE];
    expect(perms).toContain(P.SALES_CREATE);
    for (const denied of [P.SALES_DISCOUNT, P.SALES_OVERRIDE_PRICE, P.SALES_CANCEL, P.ACCOUNTING_VIEW, P.INVENTORY_ADJUST]) expect(perms).not.toContain(denied);
  });

  it("nobody can both raise and approve the same thing except the admin roles and the owning manager", () => {
    const raiseAndApprove: [PermissionKey, PermissionKey][] = [
      [P.PURCHASING_CREATE, P.PURCHASING_APPROVE],
      [P.PRODUCTION_CREATE, P.PRODUCTION_APPROVE],
    ];
    const admins: RoleName[] = [R.SUPER_ADMIN, R.ADMIN];
    for (const [create, approve] of raiseAndApprove) {
      const both = ALL_ROLE_NAMES.filter((r) => DEFAULT_ROLE_MATRIX[r].includes(create) && DEFAULT_ROLE_MATRIX[r].includes(approve));
      expect(both.filter((r) => !admins.includes(r))).toHaveLength(1); // exactly the owning manager
    }
  });
});
