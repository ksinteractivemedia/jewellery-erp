import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center gap-6 py-32 text-center" data-testid="not-found">
      <span className="eyebrow">404</span>
      <h1 className="heading-display text-h1 sm:text-display">We couldn’t find that page</h1>
      <p className="max-w-md text-body text-muted">The piece or page you were looking for may have moved, or is no longer offered.</p>
      <div className="flex gap-3"><Link href="/" className="btn btn-primary">Back to home</Link><Link href="/collections" className="btn btn-outline">Collections</Link></div>
    </div>
  );
}
