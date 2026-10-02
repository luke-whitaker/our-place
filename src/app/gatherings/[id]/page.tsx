"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ApiError, apiFetch, userMessage } from "@/lib/api-client";
import { gatheringWhen } from "@/lib/time-utils";
import { useAuth } from "@/components/AuthProvider";
import GatheringAnswerButtons from "@/components/GatheringAnswerButtons";
import GatheringHostPanel from "@/components/GatheringHostPanel";
import MushroomPortal from "@/components/MushroomPortal";
import type { GatheringDetail } from "@/lib/types";

/** Where a gathering in the world happens: its Event Mushroom, with the
 * portal once it's planted, or what the host still has to do. */
function MushroomWhere({ gathering }: { gathering: GatheringDetail }) {
  if (gathering.portal) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        At the Event Mushroom <MushroomPortal href={gathering.portal} />
      </span>
    );
  }
  if (gathering.status === "cancelled" || gathering.ended) return <>At the Event Mushroom</>;
  return gathering.is_host ? (
    <>
      At your Event Mushroom. Take it from your mailbox and plant it in the world before the start,
      or the gathering is cancelled.
    </>
  ) : (
    <>At the Event Mushroom, once the host plants it. A portal shows here then.</>
  );
}

// One gathering: when, where (the address, shown only to people who can see
// it at all), and your answer. The host also sees the guest list and can
// cancel. Anyone else gets the same "not here" as a gathering that doesn't
// exist, so the page never reveals one.
export default function GatheringPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [gathering, setGathering] = useState<GatheringDetail | null>(null);
  const [error, setError] = useState("");
  // Bumped after an answer or a cancel, so the page re-reads the gathering.
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ gathering: GatheringDetail }>(`/api/gatherings/${id}`);
        if (cancelled) return;
        setGathering(data.gathering);
        setError("");
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "This gathering isn't here, or you weren't invited to it."
            : userMessage(err, "Couldn't load this gathering."),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, router, id, version]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <p className="text-ink-muted">{error}</p>
        <Link href="/profile?tab=gatherings" className="mt-4 inline-block text-sm text-accent-600">
          Back to My Gatherings
        </Link>
      </div>
    );
  }
  if (!gathering) {
    return (
      <p className="animate-pulse px-4 py-16 text-center text-sm text-ink-muted">Loading...</p>
    );
  }

  const cancelled = gathering.status === "cancelled";
  const started = gathering.started;
  const inWorld = gathering.kind === "world";

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <section className="op-card rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">
          {inWorld ? "In the world" : "In person"}
          {gathering.community && (
            <>
              {" · "}
              <Link
                href={`/communities/${gathering.community.slug}`}
                className="hover:text-accent-600"
              >
                {gathering.community.name}
              </Link>
            </>
          )}
        </p>
        <h1 className="mt-1 break-words text-2xl font-bold text-ink">{gathering.title}</h1>
        {cancelled && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            This gathering was cancelled.
          </p>
        )}
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-xs text-ink-faint">When</dt>
            <dd className="text-ink-secondary">
              {gatheringWhen(gathering.starts_at, gathering.ends_at)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Where</dt>
            <dd className="whitespace-pre-wrap break-words text-ink-secondary">
              {inWorld ? <MushroomWhere gathering={gathering} /> : gathering.address}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Hosted by</dt>
            <dd className="text-ink-secondary">
              <Link href={`/profile/${gathering.host.username}`} className="hover:text-accent-600">
                {gathering.host.display_name}
              </Link>
            </dd>
          </div>
        </dl>
        {gathering.description && (
          <p className="mt-4 whitespace-pre-wrap break-words text-sm text-ink-tertiary">
            {gathering.description}
          </p>
        )}
        {!cancelled && !started && (
          <div className="mt-5 border-t border-line-soft pt-4">
            <GatheringAnswerButtons
              gatheringId={gathering.id}
              initial={gathering.my_response}
              isHost={gathering.is_host}
              onAnswered={reload}
            />
          </div>
        )}
      </section>

      {gathering.is_host ? (
        <GatheringHostPanel gathering={gathering} onCancelled={reload} />
      ) : (
        <section className="op-card rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Going ({gathering.going.length})</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {gathering.going.map((p) => (
              <li key={p.username}>
                <Link
                  href={`/profile/${p.username}`}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-secondary hover:text-accent-600"
                >
                  {p.display_name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
