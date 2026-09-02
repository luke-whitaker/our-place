import Link from "next/link";
import type { CommunityWithMembership } from "@/lib/types";

// The feed page's right rail: a shortcut list of the communities you've
// joined, plus the entry point for starting a new one.
export default function FeedSidebar({ communities }: { communities: CommunityWithMembership[] }) {
  return (
    <aside className="hidden lg:block w-72 shrink-0">
      <div className="sticky top-24 space-y-6">
        <div className="op-card rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ink">My Communities</h2>
            <Link href="/communities" className="text-xs text-accent-600 hover:text-accent-500">
              View all
            </Link>
          </div>
          {communities.length > 0 ? (
            <div className="space-y-1">
              {communities.slice(0, 8).map((community) => (
                <Link
                  key={community.id}
                  href={`/communities/${community.slug}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-surface-muted"
                >
                  <span className="text-lg">{community.icon}</span>
                  <span className="text-sm font-medium text-ink-secondary truncate">
                    {community.name}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-faint">No communities joined yet.</p>
          )}
          <Link
            href="/communities"
            className="mt-3 block rounded-xl bg-surface-muted py-2 text-center text-xs font-medium text-ink-tertiary hover:bg-surface-emphasis"
          >
            Discover More
          </Link>
        </div>

        <div className="op-tint rounded-2xl border border-line bg-gradient-to-br from-accent-50 to-purple-50 p-5">
          <h2 className="text-sm font-semibold text-ink">Start Something New</h2>
          <p className="mt-1 text-xs text-ink-muted">Can&apos;t find your community?</p>
          <Link
            href="/communities/create"
            className="mt-3 block rounded-xl bg-surface px-4 py-2 text-center text-sm font-medium text-accent-600 shadow-sm hover:shadow-md transition-shadow"
          >
            Create a Community
          </Link>
        </div>
      </div>
    </aside>
  );
}
