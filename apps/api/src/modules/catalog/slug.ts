import { slugify } from "@jewellery/validation";
import { ConflictError, DomainValidationError } from "../../shared/errors";

/** Structural on purpose: every slugged model satisfies this, whatever its full attrs type. */
interface SluggedModel {
  exists(filter: Record<string, unknown>): PromiseLike<unknown>;
}

/**
 * Picks a slug for a new record. An explicit slug that's taken is a conflict the caller must
 * resolve; a slug derived from the name gets a numeric suffix instead, so two products
 * called "Temple Necklace" don't make the second create fail for a reason the user never typed.
 */
export async function resolveUniqueSlug(
  model: SluggedModel,
  name: string,
  explicit?: string,
  excludeId?: string
): Promise<string> {
  const taken = async (slug: string) =>
    Boolean(await model.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }));

  if (explicit) {
    if (await taken(explicit)) throw new ConflictError(`Slug "${explicit}" is already in use`);
    return explicit;
  }
  const base = slugify(name);
  if (!base) throw new DomainValidationError("Cannot derive a slug from this name — provide one");
  if (!(await taken(base))) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new ConflictError("Could not derive a unique slug — provide one");
}
