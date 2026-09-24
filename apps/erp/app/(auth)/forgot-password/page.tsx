"use client";

import * as React from "react";
import Link from "next/link";
import { forgotPasswordSchema } from "@jewellery/validation";
import { Alert, Button, FormField, Input } from "@jewellery/ui";
import { forgotPasswordRequest } from "../../../lib/auth/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) return setError("Enter a valid email address");
    setError(null);
    setSubmitting(true);
    try {
      await forgotPasswordRequest(parsed.data.email);
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-h3 text-foreground">Check your email</h1>
        <Alert variant="success">If that email is registered, we&apos;ve sent a link to reset your password. It expires in 30 minutes.</Alert>
        <Link href="/login" className="text-center text-body-sm text-primary-active hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-h3 text-foreground">Reset your password</h1>
        <p className="text-body-sm text-muted">Enter your email and we&apos;ll send you a reset link.</p>
      </div>
      <FormField label="Email" htmlFor="email" error={error ?? undefined}>
        <Input id="email" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error} />
      </FormField>
      <Button type="submit" loading={submitting} className="w-full">
        Send reset link
      </Button>
      <Link href="/login" className="text-center text-body-sm text-primary-active hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
