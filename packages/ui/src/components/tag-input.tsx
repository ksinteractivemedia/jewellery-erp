"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Existing tags offered as one-click completions while typing. */
  suggestions?: string[];
  max?: number;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}

/**
 * Free-form chips. Enter or comma commits, Backspace on an empty field removes the last chip,
 * pasted comma-separated text becomes several. Normalisation here (trim, lowercase, de-dupe) is
 * presentation only — the API re-normalises, so it stays the source of truth.
 */
export function TagInput({ value, onChange, suggestions = [], max = 20, placeholder = "Add a tag…", invalid, disabled, id, "aria-label": ariaLabel }: TagInputProps) {
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    const incoming = raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (!incoming.length) return;
    onChange([...new Set([...value, ...incoming])].slice(0, max));
    setDraft("");
  };

  const matches = draft.trim()
    ? suggestions.filter((s) => s.includes(draft.trim().toLowerCase()) && !value.includes(s)).slice(0, 6)
    : [];

  return (
    <div className="flex flex-col gap-1.5">
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 focus-within:ring-2 focus-within:ring-ring",
          invalid && "border-danger focus-within:ring-danger",
          disabled && "opacity-50"
        )}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-caption font-medium text-foreground">
            {tag}
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((t) => t !== tag));
                }}
                className="rounded-full text-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          aria-label={ariaLabel}
          value={draft}
          disabled={disabled || value.length >= max}
          placeholder={value.length >= max ? `Up to ${max} tags` : value.length ? "" : placeholder}
          onChange={(e) => (e.target.value.includes(",") ? commit(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // Enter adds a tag; it must not submit the surrounding form.
              commit(draft);
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => commit(draft)}
          className="min-w-[8ch] flex-1 bg-transparent py-0.5 text-body text-foreground outline-none placeholder:text-muted"
        />
      </div>
      {matches.length > 0 && (
        <ul aria-label="Tag suggestions" className="flex flex-wrap gap-1.5">
          {matches.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep focus so onBlur doesn't commit the half-typed draft first
                onClick={() => commit(s)}
                className="rounded-full border border-dashed border-border px-2 py-0.5 text-caption text-muted hover:border-primary hover:text-foreground"
              >
                + {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
