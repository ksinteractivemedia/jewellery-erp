/** Base class for errors a future controller layer will map to HTTP status codes. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string
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
  constructor(from: string, to: string) {
    super(`illegal status transition: ${from} -> ${to}`, "ILLEGAL_TRANSITION");
  }
}

export class DomainValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
  }
}
