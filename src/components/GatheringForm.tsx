"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, userMessage } from "@/lib/api-client";
import { useAuth } from "@/components/AuthProvider";
import InviteePicker, { type Invitee } from "@/components/InviteePicker";
import type { CommunityWithMembership, GatheringKind } from "@/lib/types";

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

/** The two kinds, as the form offers them. */
const KINDS: { value: GatheringKind; label: string; hint: string }[] = [
  { value: "in_person", label: "In person", hint: "Meet somewhere real, at an address." },
  {
    value: "world",
    label: "In the world",
    hint: "Meet at your Event Mushroom. It arrives in your mailbox; plant it before the start, or the gathering is cancelled.",
  },
];

/**
 * <GatheringForm /> — host a gathering, in person or in the world. With a
 * community chosen, everyone in it is invited and the picker hides; without
 * one, the host picks people. Times are typed in the browser's zone and sent
 * as ISO instants. A gathering in the world has no address: it happens at the
 * host's Event Mushroom.
 */
export default function GatheringForm({ initialCommunityId }: { initialCommunityId: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [fields, setFields] = useState(() => ({
    kind: "in_person" as GatheringKind,
    title: "",
    description: "",
    address: "",
    communityId: initialCommunityId,
    ...defaultTimes(),
  }));
  const inWorld = fields.kind === "world";
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
          kind: fields.kind,
          title: fields.title,
          description: fields.description,
          address: inWorld ? "" : fields.address,
          starts_at: new Date(fields.starts).toISOString(),
          ends_at: new Date(fields.ends).toISOString(),
          community_id: fields.communityId || null,
          invitee_ids: invitees.map((i) => i.id),
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
      <Link
        href="/profile?tab=gatherings"
        className="text-sm text-ink-muted hover:text-ink-secondary"
      >
        ← My Gatherings
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-ink">Host a gathering</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Get people together, in person or in the world. Invitations arrive as a letter in each
        guest&apos;s mailbox and as a notification. An address shows only to people who are invited.
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

        <fieldset>
          <legend className={labelClass}>Where</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {KINDS.map((k) => (
              <label
                key={k.value}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border px-4 py-2.5 text-sm ${
                  fields.kind === k.value
                    ? "border-accent-400 bg-accent-50 text-accent-600"
                    : "border-line text-ink-secondary"
                }`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="g-kind"
                    value={k.value}
                    checked={fields.kind === k.value}
                    onChange={() => update("kind", k.value)}
                  />
                  {k.label}
                </span>
                <span className="text-xs text-ink-muted">{k.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

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

        {!inWorld && (
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
        )}

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

        {fields.communityId && (
          <p className="rounded-xl bg-accent-50 px-4 py-3 text-sm text-accent-600">
            Everyone in {community?.name ?? "this community"} is invited, and it shows on the
            community&apos;s calendar.
          </p>
        )}
        <InviteePicker
          value={invitees}
          onChange={setInvitees}
          selfUsername={user?.username ?? ""}
          label={fields.communityId ? "Additional invitees" : "Who's invited"}
          hint={
            fields.communityId
              ? `Anyone outside ${community?.name ?? "the community"} you'd also like to invite.`
              : undefined
          }
        />

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
