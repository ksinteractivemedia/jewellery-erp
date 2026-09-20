import { Gem } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-8 flex items-center gap-2 font-display text-h3 text-foreground">
        <Gem className="h-6 w-6 text-primary" aria-hidden="true" /> Suvarna ERP
      </div>
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-md">{children}</div>
      <p className="mt-6 text-caption text-muted">Authorised staff only. Activity is logged.</p>
    </main>
  );
}
