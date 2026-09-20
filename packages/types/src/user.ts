import type { Id, Timestamps } from "./common";

export type UserType = "STAFF" | "B2B_BUYER" | "B2C_CUSTOMER";

/** Safe shape — never carries the password hash. This is what any frontend may see. */
export interface User extends Timestamps {
  id: Id;
  email?: string;
  phone?: string;
  name: string;
  userType: UserType;
  roleIds: Id[];
  /** Links a B2B_BUYER/B2C_CUSTOMER user to their Customer record. Null for STAFF. */
  customerId?: Id;
  branchId?: Id;
  isActive: boolean;
  lastLoginAt?: Date;
}

/** Internal-only shape (auth service). Never sent across the API boundary. */
export interface UserWithCredentials extends User {
  passwordHash: string;
  /** Consecutive failed logins since the last success/lock — drives account lockout. */
  failedLoginAttempts: number;
  lockedUntil?: Date;
  passwordChangedAt?: Date;
}
