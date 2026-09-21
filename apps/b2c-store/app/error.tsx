"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-page flex flex-col items-center gap-6 py-32 text-center" role="alert" data-testid="error-page">
      <span className="eyebrow">Something went wrong</span>
      <h1 className="heading-display text-h1">We couldn’t load this page</h1>
      <p className="max-w-md text-body text-muted">It’s on our side. Please try again in a moment.</p>
      <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
