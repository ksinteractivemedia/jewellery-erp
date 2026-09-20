"use client";

import * as React from "react";
import { slugify } from "@jewellery/validation";
import { createProductCategorySchema, createProductCollectionSchema } from "@jewellery/validation";
import { Button, Combobox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FormField, Input, Switch, Textarea } from "@jewellery/ui";
import { useCatalogMutation } from "../../lib/api/queries";
import { ApiError } from "../../lib/auth/api-client";

export interface TaxonomyDraft {
  id?: string;
  name: string;
  slug: string;
  description: string;
  parentId: string;
  isActive: boolean;
}

export const emptyDraft = (over: Partial<TaxonomyDraft> = {}): TaxonomyDraft => ({ name: "", slug: "", description: "", parentId: "", isActive: true, ...over });

/**
 * One create/edit dialog for both categories and collections — they share name, slug,
 * description and active; only categories have a parent. The caller supplies the save calls.
 */
export function TaxonomyDialog({
  kind,
  draft,
  parentOptions,
  onOpenChange,
  onCreate,
  onUpdate,
}: {
  kind: "category" | "collection";
  draft: TaxonomyDraft | null;
  /** Categories only: valid parents (the caller excludes the category itself and its descendants). */
  parentOptions?: { value: string; label: string }[];
  onOpenChange: (open: boolean) => void;
  onCreate: (input: Record<string, unknown>) => Promise<unknown>;
  onUpdate: (id: string, input: Record<string, unknown>) => Promise<unknown>;
}) {
  const [values, setValues] = React.useState<TaxonomyDraft>(emptyDraft());
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const editing = draft?.id !== undefined;
  const noun = kind === "category" ? "category" : "collection";

  React.useEffect(() => {
    if (draft) {
      setValues(draft);
      setErrors({});
    }
  }, [draft]);

  const save = useCatalogMutation(
    (v: TaxonomyDraft) => {
      const common = { name: v.name, slug: v.slug.trim() || undefined, isActive: v.isActive };
      if (kind === "category") {
        return v.id
          ? onUpdate(v.id, { ...common, description: v.description.trim() || null, parentId: v.parentId || null })
          : onCreate({ ...common, ...(v.description.trim() ? { description: v.description } : {}), ...(v.parentId ? { parentId: v.parentId } : {}) });
      }
      return v.id
        ? onUpdate(v.id, { ...common, description: v.description.trim() || null })
        : onCreate({ ...common, ...(v.description.trim() ? { description: v.description } : {}) });
    },
    {
      success: editing ? `${noun[0]!.toUpperCase()}${noun.slice(1)} saved` : `${noun[0]!.toUpperCase()}${noun.slice(1)} created`,
      onSuccess: () => onOpenChange(false),
      onError: (e) => e instanceof ApiError && setErrors({ [/slug/i.test(e.message) ? "slug" : "name"]: e.message }),
    }
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const schema = kind === "category" ? createProductCategorySchema : createProductCollectionSchema;
    const parsed = schema.safeParse({ name: values.name, slug: values.slug.trim() || undefined });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate(values);
  };

  const set = <K extends keyof TaxonomyDraft>(key: K, value: TaxonomyDraft[K]) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <Dialog open={draft !== null} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${noun}` : `New ${noun}`}</DialogTitle>
            <DialogDescription>
              {kind === "category" ? "Categories are the catalogue's structure — each product has one." : "Collections are curated groupings — a product can belong to several."}
            </DialogDescription>
          </DialogHeader>
          <FormField label="Name" htmlFor="tax-name" required error={errors.name}>
            <Input id="tax-name" value={values.name} onChange={(e) => set("name", e.target.value)} invalid={!!errors.name} autoComplete="off" autoFocus />
          </FormField>
          <FormField label="URL slug" htmlFor="tax-slug" error={errors.slug} hint={editing ? "Changing this changes storefront URLs." : "Leave blank to generate it from the name."}>
            <Input id="tax-slug" value={values.slug} onChange={(e) => set("slug", e.target.value)} placeholder={slugify(values.name) || "generated-from-name"} invalid={!!errors.slug} autoComplete="off" />
          </FormField>
          {kind === "category" && (
            <FormField label="Parent category" htmlFor="tax-parent">
              <Combobox aria-label="Parent category" placeholder="Top level" searchPlaceholder="Search categories…" options={[{ value: "", label: "Top level" }, ...(parentOptions ?? [])]} value={values.parentId} onValueChange={(v) => set("parentId", v)} />
            </FormField>
          )}
          <FormField label="Description" htmlFor="tax-description">
            <Textarea id="tax-description" rows={3} value={values.description} onChange={(e) => set("description", e.target.value)} />
          </FormField>
          <label className="flex items-center justify-between gap-4">
            <span className="text-body font-medium">Active</span>
            <Switch checked={values.isActive} onCheckedChange={(c) => set("isActive", c)} aria-label="Active" />
          </label>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? "Save" : `Create ${noun}`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
