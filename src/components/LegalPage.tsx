import type { ReactNode } from "react";
import Link from "next/link";

// The shared frame for the privacy policy and the terms: a short summary up
// top, then sections a reader can jump between, each one standing on its own.

export const LEGAL_CONTACT = "ourplaceonline@proton.me";

export function LegalPage({
  title,
  updated,
  summary,
  sections,
  children,
}: {
  title: string;
  updated: string;
  summary: string[];
  sections: { id: string; title: string }[];
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-ink-faint">Last updated {updated}</p>

      <div className="op-card mt-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">The short version</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-secondary">
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <nav aria-label="Sections" className="mt-6">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-accent-600 hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 space-y-8">{children}</div>

      <p className="mt-10 border-t border-line pt-6 text-sm text-ink-muted">
        Questions? Write to{" "}
        <a href={`mailto:${LEGAL_CONTACT}`} className="text-accent-600 hover:underline">
          {LEGAL_CONTACT}
        </a>
        . See also the{" "}
        <Link href="/privacy" className="text-accent-600 hover:underline">
          privacy policy
        </Link>{" "}
        and the{" "}
        <Link href="/terms" className="text-accent-600 hover:underline">
          terms
        </Link>
        .
      </p>
    </div>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-ink-secondary [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}
