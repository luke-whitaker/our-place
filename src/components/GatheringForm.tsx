"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, userMessage } from "@/lib/api-client";
import { useAuth } from "@/components/AuthProvider";
import InviteePicker, { type Invitee } from "@/components/InviteePicker";
import type { CommunityWithMembership } from "@/lib/types";

const inputClass =
  "w-full rounded-xl border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400";
const labelClass = "mb-1.5 block text-sm font-medium text-ink-secondary";

/** A Date as a datetime-local input's value, in the browser's own time zone. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Tomorrow at 6 pm, for two hours: a sensible first guess to edit. */
function defaultTimes(): { starts: string; ends: string } {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { starts: toLocalInput(start), ends: toLocalInput(end) };
}

/**
 * <GatheringForm /> — host an in-person gathering. With a community chosen,
 * everyone in it is invited and the picker hides; without one, the host picks
 * people. Times are typed in the browser's zone and sent as ISO instants.
 */
export default function GatheringForm({ initialCommunityId }: { initialCommunityId: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [fields, setFields] = useState(() => ({
    title: "",
    description: "",
    address: "",
    communityId: initialCommunityId,
    ...defaultTimes(),
  }));
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [communities, setCommunities] = useState<CommunityWithMembership[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ communities: CommunityWithMembership[] }>(
          "/api/communities?joined=true",
        );
        if (!cancelled) setCommunities(data.communities);
      } catch (err) {
        if (!cancelled) setError(userMessage(err, "Couldn't load your communities."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, router]);

  function update(field: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [field]: value }));
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const data = await apiFetch<{ gathering: { id: string } }>("/api/gatherings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "in_person",
          title: fields.title,
          description: fields.description,
          address: fields.address,
          starts_at: new Date(fields.starts).toISOString(),
          ends_at: new Date(fields.ends).toISOString(),
          community_id: fields.communityId || null,
          invitee_ids: fields.communityId ? [] : invitees.map((i) => i.id),
        }),
      });
      router.push(`/gatherings/${data.gathering.id}`);
    } catch (err) {
      setError(userMessage(err, "Couldn't create that gathering."));
      setSubmitting(false);
    }
  }

  const community = communities.find((c) => c.id === fields.communityId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/profile" className="text-sm text-ink-muted hover:text-ink-secondary">
        ← My Place
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-ink">Host a gathering</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Get people together in person. Invitations arrive as a letter in each guest&apos;s mailbox
        and as a notification. The address shows only to people who are invited.
      </p>

      <form
        onSubmit={submit}
        className="op-card mt-6 space-y-5 rounded-2xl border border-line bg-surface p-5 sm:p-6"
      >
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"
          >
            {error}
          </p>
        )}

        <div>
          <label htmlFor="g-title" className={labelClass}>
            Name
          </label>
          <input
            id="g-title"
            value={fields.title}
            onChange={(e) => update("title", e.target.value)}
            maxLength={100}
            required
            placeholder="Picnic in the park"
            className={inputClass}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="g-starts" className={labelClass}>
              Starts
            </label>
            <input
              id="g-starts"
              type="datetime-local"
              value={fields.starts}
              onChange={(e) => update("starts", e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="g-ends" className={labelClass}>
              Ends
            </label>
            <input
              id="g-ends"
              type="datetime-local"
              value={fields.ends}
              onChange={(e) => update("ends", e.target.value)}
              required
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="g-address" className={labelClass}>
            Address
          </label>
          <input
            id="g-address"
            value={fields.address}
            onChange={(e) => update("address", e.target.value)}
            maxLength={300}
            required
            placeholder="Where to meet"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="g-description" className={labelClass}>
            Details <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <textarea
            id="g-description"
            value={fields.description}
            onChange={(e) => update("description", e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="What to bring, where to park, anything else"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="g-community" className={labelClass}>
            For a community <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <select
            id="g-community"
            value={fields.communityId}
            onChange={(e) => update("communityId", e.target.value)}
            className={inputClass}
          >
            <option value="">No, I&apos;ll pick who to invite</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>

        {fields.communityId ? (
          <p className="rounded-xl bg-accent-50 px-4 py-3 text-sm text-accent-600">
            Everyone in {community?.name ?? "this community"} is invited, and it shows on the
            community&apos;s calendar.
          </p>
        ) : (
          <InviteePicker
            value={invitees}
            onChange={setInvitees}
            selfUsername={user?.username ?? ""}
          />
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-accent-500 px-6 py-2.5 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent-600 disabled:opacity-50"
        >
          {submitting ? "Sending invitations..." : "Host it and send invitations"}
        </button>
      </form>
    </div>
  );
}
