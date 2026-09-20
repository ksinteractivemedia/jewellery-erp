import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";

/** Structural slice of a Zod schema — keeps `zod` out of this app's dependencies; the schema itself comes from @jewellery/validation. */
interface PayloadSchema {
  safeParse(input: unknown): { success: true } | { success: false; error: { issues: { path: (string | number)[]; message: string; code: string }[] } };
}

/**
 * React Hook Form resolver that validates the *API payload* built from the form values with
 * the very same Zod schema the API uses — so the client can never accept something the API
 * rejects for a rule the form forgot (and there's one copy of every rule, in packages/validation).
 * Values are handed back untouched; the caller maps them to a payload again on submit.
 */
export function payloadResolver<T extends FieldValues>(schema: PayloadSchema, toPayload: (values: T) => unknown): Resolver<T> {
  return async (values) => {
    const result = schema.safeParse(toPayload(values));
    if (result.success) return { values, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "root");
      errors[field] ??= { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<T> };
  };
}
