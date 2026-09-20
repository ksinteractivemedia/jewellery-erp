"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export interface UploaderImage {
  /** Stable identity (the storage key). */
  key: string;
  url: string;
  alt?: string;
}

export interface ImageUploaderProps {
  images: UploaderImage[];
  onChange: (images: UploaderImage[]) => void;
  /** Uploads one file and resolves with its stored image. Rejecting shows the message on that file only. */
  onUpload: (file: File) => Promise<UploaderImage>;
  max?: number;
  maxBytes?: number;
  /** MIME types the picker offers and the drop zone accepts. */
  accept?: string[];
  disabled?: boolean;
}

interface Pending {
  id: string;
  name: string;
  error?: string;
}

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

/**
 * Multi-image picker: click or drag-and-drop, per-file upload state and errors, reorder with
 * buttons (keyboard and touch friendly — no drag-only interactions), remove, alt text. The
 * first image is the primary one. File checks here are a convenience; the API validates the bytes.
 */
export function ImageUploader({ images, onChange, onUpload, max = 12, maxBytes = 5 * 1024 * 1024, accept = ["image/png", "image/jpeg", "image/webp"], disabled }: ImageUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<Pending[]>([]);
  const [dragging, setDragging] = React.useState(false);
  // Uploads finish out of order and each resolves inside its own closure — always append to the latest list.
  const latest = React.useRef(images);
  latest.current = images;

  const upload = async (file: File, id: string) => {
    try {
      const stored = await onUpload(file);
      onChange([...latest.current, stored]);
      setPending((p) => p.filter((x) => x.id !== id));
    } catch (error) {
      setPending((p) => p.map((x) => (x.id === id ? { ...x, error: error instanceof Error ? error.message : "Upload failed" } : x)));
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const room = Math.max(0, max - images.length - pending.filter((p) => !p.error).length);
    [...files].forEach((file, i) => {
      const id = `${Date.now()}-${i}-${file.name}`;
      const problem = i >= room ? `Limit of ${max} images reached` : !accept.includes(file.type) ? "Use a PNG, JPEG or WebP image" : file.size > maxBytes ? `Larger than ${formatMb(maxBytes)}` : undefined;
      setPending((p) => [...p, { id, name: file.name, error: problem }]);
      if (!problem) void upload(file, id);
    });
    if (inputRef.current) inputRef.current.value = "";
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center transition-colors",
          dragging && "border-primary bg-primary-subtle",
          disabled && "opacity-50"
        )}
      >
        <ImagePlus className="h-6 w-6 text-muted" aria-hidden="true" />
        <p className="text-body-sm text-muted">Drag images here, or</p>
        <Button type="button" variant="secondary" size="sm" disabled={disabled || images.length >= max} onClick={() => inputRef.current?.click()}>
          Choose images
        </Button>
        <p className="text-caption text-muted">
          PNG, JPEG or WebP · up to {formatMb(maxBytes)} each · {images.length}/{max}
        </p>
        <input ref={inputRef} type="file" accept={accept.join(",")} multiple hidden aria-label="Upload images" disabled={disabled} onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>

      {pending.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Uploads">
          {pending.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-body-sm">
              {p.error ? (
                <>
                  <span role="alert" className="min-w-0 flex-1 truncate text-danger">
                    {p.name}: {p.error}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPending((all) => all.filter((x) => x.id !== p.id))}>
                    Dismiss
                  </Button>
                </>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-muted">Uploading {p.name}…</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Product images">
          {images.map((image, i) => (
            <li key={image.key} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-2">
              <div className="relative aspect-square overflow-hidden rounded-md bg-surface-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt || `Product image ${i + 1}`} className="h-full w-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-caption font-medium text-foreground shadow">
                    <Star className="h-3 w-3 fill-primary text-primary" aria-hidden="true" /> Primary
                  </span>
                )}
              </div>
              <input
                value={image.alt ?? ""}
                maxLength={200}
                disabled={disabled}
                aria-label={`Alt text for image ${i + 1}`}
                placeholder="Alt text"
                onChange={(e) => onChange(images.map((im) => (im.key === image.key ? { ...im, alt: e.target.value } : im)))}
                className="h-8 w-full rounded-md border border-border bg-surface px-2 text-body-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Move image ${i + 1} earlier`} disabled={disabled || i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Move image ${i + 1} later`} disabled={disabled || i === images.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-danger" aria-label={`Remove image ${i + 1}`} disabled={disabled} onClick={() => onChange(images.filter((im) => im.key !== image.key))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
