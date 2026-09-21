/** Base class for errors a future controller layer will map to HTTP status codes. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    /** Extra, client-safe facts to return with the error (e.g. the fresh prices after PRICE_CHANGED). */
    public readonly details?: unknown
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT");
  }
}

/** Raised when code tries to update/delete an append-only record (business-rules.md §2.1). */
export class ImmutableRecordError extends AppError {
  constructor(entity: string) {
    super(`${entity} is append-only and cannot be updated or deleted`, "IMMUTABLE_RECORD");
  }
}

/** Raised when a requested InventoryItem/StoneInventory status change isn't a legal transition. */
export class IllegalTransitionError extends AppError {
  constructor(from: string, to: string, movement?: string) {
    super(`illegal status transition: ${from} -> ${to}${movement ? ` (${movement} cannot do this)` : ""}`, "ILLEGAL_TRANSITION");
  }
}

/** A stock operation that would take quantity or weight below zero. */
export class InsufficientStockError extends AppError {
  constructor(message: string) {
    super(message, "INSUFFICIENT_STOCK");
  }
}

/** The record changed between being read and being written — someone else's movement got there first. */
export class ConcurrentModificationError extends AppError {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} was changed by another operation — reload and try again`, "CONCURRENT_MODIFICATION");
  }
}

/** The piece is held for a different order than the caller claims. */
export class ReservationConflictError extends AppError {
  constructor(message: string) {
    super(message, "RESERVED_FOR_OTHER");
  }
}

export class DuplicateIdentifierError extends AppError {
  constructor(field: "HUID" | "barcode" | "item code" | "serial number", value: string) {
    super(`${field} ${value} is already assigned to another item`, "DUPLICATE_IDENTIFIER");
  }
}

export class DomainValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
  }
}

/** 401. `code` lets a client distinguish "refresh and retry" (TOKEN_EXPIRED) from "sign in again". */
export class AuthenticationError extends AppError {
  constructor(message = "Authentication required", code: "UNAUTHENTICATED" | "TOKEN_EXPIRED" | "INVALID_CREDENTIALS" = "UNAUTHENTICATED") {
    super(message, code);
  }
}

/** 403 — authenticated, but the policy said no. */
export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, "FORBIDDEN");
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests, try again later") {
    super(message, "RATE_LIMITED");
  }
}

export class InvalidResetTokenError extends AppError {
  constructor() {
    super("This password reset link is invalid or has expired", "INVALID_RESET_TOKEN");
  }
}
