import Link from "next/link";

// Where a member lands after deleting their account. Public on purpose: by
// now they're signed out everywhere.
export default function GoodbyePage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="op-card w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-ink">Your account is deleted</h1>
        <p className="mt-3 text-sm text-ink-muted">
          You&apos;re signed out on every device, and your account can&apos;t be signed into again.
          Thank you for being part of Our Place.
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          If you&apos;d like to come back one day, reach out to Luke, who creates every account.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-muted"
        >
          Go to the front page
        </Link>
      </div>
    </div>
  );
}
