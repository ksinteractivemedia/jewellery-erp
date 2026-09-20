"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import type { ProductDetail } from "@jewellery/types";
import { MAX_IMAGE_BYTES, MAX_PRODUCT_IMAGES, MAX_PRODUCT_TAGS, MAX_PRODUCT_VIDEOS, createProductSchema, slugify } from "@jewellery/validation";
import {
  Button,
  Card,
  CardContent,
  Combobox,
  FormField,
  FormSection,
  ImageUploader,
  Input,
  MultiSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TagInput,
  Textarea,
  WeightInput,
} from "@jewellery/ui";
import { catalogApi } from "../../lib/api/catalog";
import { useCatalogMeta, useCatalogMutation, useCategories, useCollections } from "../../lib/api/queries";
import { ApiError } from "../../lib/auth/api-client";
import { payloadResolver } from "../../lib/catalog/payload-resolver";
import { EMPTY_PRODUCT_FORM, toCreatePayload, toFormValues, toUpdatePayload, type ProductFormValues } from "../../lib/catalog/product-form";

export function ProductForm({ product }: { product?: ProductDetail }) {
  const router = useRouter();
  const editing = product !== undefined;
  const meta = useCatalogMeta();
  const categories = useCategories();
  const collections = useCollections();

  const form = useForm<ProductFormValues>({
    defaultValues: product ? toFormValues(product) : EMPTY_PRODUCT_FORM,
    resolver: payloadResolver<ProductFormValues>(createProductSchema, toCreatePayload),
  });
  const { control, register, watch, setValue, setError, handleSubmit, formState } = form;
  const { errors, isDirty } = formState;

  const save = useCatalogMutation(
    (values: ProductFormValues) => (product ? catalogApi.updateProduct(product.id, toUpdatePayload(values)) : catalogApi.createProduct(toCreatePayload(values))),
    {
      success: editing ? "Product saved" : "Product created",
      onSuccess: (saved) => {
        form.reset(form.getValues()); // clean, so the leave-page guard doesn't fire on our own redirect
        router.push(`/inventory/products/${saved.id}`);
      },
      onError: (error) => {
        // A conflict names the field at fault — put it next to the input, not only in a toast.
        if (error instanceof ApiError && error.status === 409) setError(/slug/i.test(error.message) ? "slug" : "sku", { message: error.message });
      },
    }
  );

  React.useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const name = watch("name");
  const metalId = watch("metalId");
  const metals = meta.data?.metals ?? [];
  const purities = metals.find((m) => m.id === metalId)?.purities ?? [];
  const cancelHref = product ? `/inventory/products/${product.id}` : "/inventory/products";
  const videos = watch("videos");

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          <FormSection title="Basics" description="How the product is identified across the ERP and the storefronts.">
            <FormField label="SKU" htmlFor="sku" required error={errors.sku?.message} hint={editing ? "The SKU can't be changed once created." : "Unique across products and variants. Saved in capitals."}>
              <Input id="sku" {...register("sku")} disabled={editing} invalid={!!errors.sku} autoComplete="off" className="font-mono uppercase" />
            </FormField>
            <FormField label="Name" htmlFor="name" required error={errors.name?.message}>
              <Input id="name" {...register("name")} invalid={!!errors.name} autoComplete="off" />
            </FormField>
            <FormField label="URL slug" htmlFor="slug" error={errors.slug?.message} hint={editing ? "Changing this changes the storefront URL." : "Leave blank to generate it from the name."}>
              <Input id="slug" {...register("slug")} invalid={!!errors.slug} placeholder={slugify(name) || "generated-from-name"} autoComplete="off" />
            </FormField>
            <FormField label="Description" htmlFor="description" error={errors.description?.message} className="sm:col-span-2">
              <Textarea id="description" {...register("description")} rows={4} invalid={!!errors.description} />
            </FormField>
          </FormSection>

          <FormSection title="Classification">
            <FormField label="Category" htmlFor="category" hint="One structural home, e.g. Rings.">
              <Controller control={control} name="categoryId" render={({ field }) => (
                <Combobox aria-label="Category" placeholder="No category" searchPlaceholder="Search categories…" options={[{ value: "", label: "No category" }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} value={field.value} onValueChange={field.onChange} />
              )} />
            </FormField>
            <FormField label="Collections" htmlFor="collections" hint="Curated groupings, e.g. Bridal Edit. A product can be in several.">
              <Controller control={control} name="collectionIds" render={({ field }) => (
                <MultiSelect aria-label="Collections" placeholder="No collections" searchPlaceholder="Search collections…" options={(collections.data ?? []).map((c) => ({ value: c.id, label: c.name }))} value={field.value} onValueChange={field.onChange} />
              )} />
            </FormField>
            <FormField label="Tags" htmlFor="tags" error={errors.tags?.message} hint="Press Enter or comma to add. Used by search." className="sm:col-span-2">
              <Controller control={control} name="tags" render={({ field }) => (
                <TagInput id="tags" value={field.value} onChange={field.onChange} suggestions={meta.data?.tags} max={MAX_PRODUCT_TAGS} invalid={!!errors.tags} />
              )} />
            </FormField>
          </FormSection>

          <FormSection title="Metal & design" description="Design guidance only — each physical piece's real weight is recorded on its inventory item.">
            <FormField label="Metal" htmlFor="metal" required error={errors.metalId?.message}>
              <Controller control={control} name="metalId" render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => { field.onChange(v); setValue("purity", "", { shouldDirty: true }); }}>
                  <SelectTrigger id="metal" aria-label="Metal" invalid={!!errors.metalId}>
                    <SelectValue placeholder="Choose a metal" />
                  </SelectTrigger>
                  <SelectContent>
                    {metals.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </FormField>
            <FormField label="Purity" htmlFor="purity" error={errors.purity?.message} hint={metalId && purities.length === 0 ? "This metal has no purities configured." : undefined}>
              <Controller control={control} name="purity" render={({ field }) => (
                <Combobox aria-label="Purity" placeholder={metalId ? "Choose a purity" : "Choose a metal first"} disabled={!metalId || purities.length === 0} options={[{ value: "", label: "Not specified" }, ...purities.map((p) => ({ value: p, label: p }))]} value={field.value} onValueChange={field.onChange} />
              )} />
            </FormField>
            <FormField label="Typical gross weight" htmlFor="gross" error={errors.defaultGrossWeight?.message}>
              <Controller control={control} name="defaultGrossWeight" render={({ field }) => (
                <WeightInput id="gross" value={field.value} onValueChange={field.onChange} invalid={!!errors.defaultGrossWeight} />
              )} />
            </FormField>
            <FormField label="Typical net weight" htmlFor="net" error={errors.defaultNetWeight?.message}>
              <Controller control={control} name="defaultNetWeight" render={({ field }) => (
                <WeightInput id="net" value={field.value} onValueChange={field.onChange} invalid={!!errors.defaultNetWeight} />
              )} />
            </FormField>
          </FormSection>

          <FormSection title="Media" description="The first image is the primary one shown in lists and on the storefront.">
            <div className="flex flex-col gap-6 sm:col-span-2">
              <FormField label="Images" error={errors.images?.message}>
                <Controller control={control} name="images" render={({ field }) => (
                  <ImageUploader
                    images={field.value}
                    onChange={(images) => field.onChange(images)}
                    onUpload={async (file) => {
                      const { key, url } = await catalogApi.uploadImage(file);
                      return { key, url };
                    }}
                    max={MAX_PRODUCT_IMAGES}
                    maxBytes={MAX_IMAGE_BYTES}
                  />
                )} />
              </FormField>
              <FormField label="Video links" error={errors.videos?.message} hint={`Link to hosted videos (https). Up to ${MAX_PRODUCT_VIDEOS}.`}>
                <div className="flex flex-col gap-2">
                  {videos.map((url, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input aria-label={`Video link ${i + 1}`} value={url} placeholder="https://…" onChange={(e) => setValue("videos", videos.map((v, j) => (j === i ? e.target.value : v)), { shouldDirty: true })} />
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove video link ${i + 1}`} onClick={() => setValue("videos", videos.filter((_, j) => j !== i), { shouldDirty: true })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div>
                    <Button type="button" variant="secondary" size="sm" disabled={videos.length >= MAX_PRODUCT_VIDEOS} onClick={() => setValue("videos", [...videos, ""], { shouldDirty: true })}>
                      <Plus className="h-4 w-4" /> Add video link
                    </Button>
                  </div>
                </div>
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Availability">
            <div className="flex flex-col gap-3 sm:col-span-2">
              {(
                [
                  ["isActive", "Active", "Inactive products stay in the catalogue with their history but aren't offered anywhere."],
                  ["b2cEnabled", "Show on B2C storefront", "Consumers can see and buy this design."],
                  ["b2bEnabled", "Show in B2B portal", "Wholesale buyers can see and order this design."],
                ] as const
              ).map(([name, label, help]) => (
                <Controller key={name} control={control} name={name} render={({ field }) => (
                  <label className="flex items-start justify-between gap-4 rounded-md border border-border-subtle p-3">
                    <span className="flex flex-col">
                      <span className="text-body font-medium text-foreground">{label}</span>
                      <span className="text-body-sm text-muted">{help}</span>
                    </span>
                    <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={label} />
                  </label>
                )} />
              ))}
            </div>
          </FormSection>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-30 -mx-4 -mb-4 flex justify-end gap-2 border-t border-border bg-surface-elevated px-4 py-3 md:-mx-6 md:-mb-6 md:px-6">
        <Button asChild variant="secondary">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button type="submit" loading={save.isPending}>
          {editing ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
