"use client";

import * as React from "react";
import { newsletterSchema } from "@jewellery/validation";
import { storePost } from "../../lib/api";
import { Section } from "../ui/section";

/** A working newsletter sign-up: the address is validated, sent to the API and stored. (Nothing is emailed from here yet.) */
export function Newsletter({ brand }: { brand: string }) {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = newsletterSchema.safeParse({ email });
    if (!parsed.success) { setState("error"); setMessage("Please enter a valid email address."); return; }
    setState("sending");
    try {
      await storePost("/newsletter", parsed.data);
      setState("done");
    } catch {
      setState("error");
      setMessage("Sorry, we couldn’t save that just now. Please try again.");
    }
  };

  return (
    <Section label="Newsletter">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6 text-center" data-testid="newsletter">
        <span className="eyebrow">Stay in touch</span>
        <h2 className="heading-display text-h1">Hear from {brand}</h2>
        <p className="text-body text-muted">New collections and pieces, in your inbox.</p>
        {state === "done" ? (
          <p className="text-body font-medium" role="status" data-testid="newsletter-done">Thank you — you’re on our list.</p>
        ) : (
          <form onSubmit={submit} noValidate className="flex w-full flex-col gap-3 sm:flex-row" aria-describedby={state === "error" ? "newsletter-error" : undefined}>
            <label htmlFor="newsletter-email" className="sr-only">Email address</label>
            <input id="newsletter-email" type="email" autoComplete="email" inputMode="email" placeholder="Your email address" value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }} aria-invalid={state === "error" || undefined} className="h-12 flex-1 border border-border bg-surface px-4 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="newsletter-email" />
            <button type="submit" className="btn btn-dark" disabled={state === "sending"} data-testid="newsletter-submit">{state === "sending" ? "Sending…" : "Subscribe"}</button>
          </form>
        )}
        {state === "error" && <p id="newsletter-error" role="alert" className="text-body-sm text-danger">{message}</p>}
      </div>
    </Section>
  );
}
