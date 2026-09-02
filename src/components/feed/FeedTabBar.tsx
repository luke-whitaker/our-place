import Link from "next/link";

export type FeedTab = "friends" | "everyone" | "communities";

const TAB_ORDER: FeedTab[] = ["friends", "everyone", "communities"];

function FriendsIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="h-6 w-6"
      fill={active ? "currentColor" : "none"}
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
      />
    </svg>
  );
}

// A globe: "Everyone" is every post on the platform, not a curated scroll.
function EveryoneIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="h-6 w-6"
      fill={active ? "currentColor" : "none"}
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
      />
    </svg>
  );
}

function CommunitiesIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="h-6 w-6"
      fill={active ? "currentColor" : "none"}
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
      />
    </svg>
  );
}

// Two people — the member directory this slot links to, distinct from the
// three-person Friends glyph above.
function PeopleIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 20.25v-1.5a3.75 3.75 0 0 0-3.75-3.75h-3A3.75 3.75 0 0 0 6.5 18.75v1.5M14.75 8.25a2.75 2.75 0 1 1-5.5 0 2.75 2.75 0 0 1 5.5 0ZM21 20.25v-1a3 3 0 0 0-2.25-2.906M18 7.315a2.75 2.75 0 0 1 0 5.373"
      />
    </svg>
  );
}

const TAB_ICONS = {
  friends: FriendsIcon,
  everyone: EveryoneIcon,
  communities: CommunitiesIcon,
};

// The feed's bottom dashboard nav: three feed tabs plus a fourth slot that
// links straight out to the member directory instead of switching tabs.
export default function FeedTabBar({
  activeTab,
  onTabChange,
  tabLabels,
}: {
  activeTab: FeedTab;
  onTabChange: (tab: FeedTab) => void;
  tabLabels: Record<FeedTab, string>;
}) {
  return (
    <nav
      aria-label="Feed navigation"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-line bg-surface/95 backdrop-blur-lg sm:static sm:mt-8 sm:rounded-2xl sm:border sm:bg-surface sm:shadow-sm"
    >
      <div className="mx-auto max-w-lg flex">
        {TAB_ORDER.map((key) => {
          const Icon = TAB_ICONS[key];
          const active = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              aria-label={tabLabels[key]}
              aria-current={active ? "page" : undefined}
              className={`flex-1 flex flex-col items-center gap-1 py-3 sm:py-4 transition-colors ${
                active ? "text-accent-600" : "text-ink-faint hover:text-ink-tertiary"
              }`}
            >
              <Icon active={active} />
              <span
                className={`text-[10px] sm:text-xs font-medium ${active ? "text-accent-600" : "text-ink-faint"}`}
              >
                {tabLabels[key]}
              </span>
              {active && (
                <span className="absolute bottom-0 h-0.5 w-10 rounded-full bg-accent-500 sm:hidden" />
              )}
            </button>
          );
        })}
        <Link
          href="/people"
          aria-label="People"
          className="flex-1 flex flex-col items-center gap-1 py-3 sm:py-4 text-ink-faint transition-colors hover:text-ink-tertiary"
        >
          <PeopleIcon />
          <span className="text-[10px] sm:text-xs font-medium text-ink-faint">People</span>
        </Link>
      </div>
    </nav>
  );
}
