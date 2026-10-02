"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, userMessage } from "@/lib/api-client";
import { timeAgo } from "@/lib/time-utils";
import GatheringAnswerButtons from "@/components/GatheringAnswerButtons";
import type { NotificationActor, NotificationItem, NotificationPost } from "@/lib/types";

function Name({ actor }: { actor: NotificationActor }) {
  return (
    <Link
      href={`/profile/${actor.username}`}
      className="font-semibold text-ink hover:text-accent-600"
    >
      {actor.display_name}
    </Link>
  );
}

function PostLink({ post }: { post: NotificationPost }) {
  return (
    <Link href={post.href} className="font-medium text-ink hover:text-accent-600">
      {post.title ? `"${post.title}"` : "your post"}
    </Link>
  );
}

/** "Ada", "Ada and Ben", "Ada, Ben and 1 other", "Ada, Ben and 3 others". */
function Reactors({ actors, count }: { actors: NotificationActor[]; count: number }) {
  const others = count - actors.length;
  return (
    <>
      {actors.map((actor, i) => (
        <span key={actor.username}>
          {i > 0 && (i === actors.length - 1 && others === 0 ? " and " : ", ")}
          <Name actor={actor} />
        </span>
      ))}
      {others > 0 && ` and ${others} ${others === 1 ? "other" : "others"}`}
    </>
  );
}

type Answer = "accepted" | "declined";

/** Accept and Decline, right on the notification, so a request never waits on a
 * trip to the People page. */
function RequestButtons({ friendshipId }: { friendshipId: string }) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");

  async function respond(method: "PATCH" | "DELETE") {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/friends/${friendshipId}`, { method });
      setAnswer(method === "PATCH" ? "accepted" : "declined");
    } catch (err) {
      setError(userMessage(err, "Couldn't answer that request."));
    } finally {
      setBusy(false);
    }
  }

  if (answer) {
    return (
      <p className="mt-2 text-xs text-ink-muted">
        {answer === "accepted" ? "You're friends now." : "Request declined."}
      </p>
    );
  }
  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <button
          onClick={() => respond("PATCH")}
          disabled={busy}
          className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-inverse transition-colors hover:bg-accent-600 disabled:opacity-50"
        >
          Accept
        </button>
        <button
          onClick={() => respond("DELETE")}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-emphasis disabled:opacity-50"
        >
          Decline
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function Message({ item }: { item: NotificationItem }) {
  switch (item.kind) {
    case "friend_request":
      return (
        <>
          <Name actor={item.actor} /> sent you a friend request.
        </>
      );
    case "friend_accepted":
      return (
        <>
          <Name actor={item.actor} /> accepted your friend request.
        </>
      );
    case "comment":
      return (
        <>
          <Name actor={item.actor} /> commented on <PostLink post={item.post} />:
        </>
      );
    case "reactions":
      return (
        <>
          <Reactors actors={item.actors} count={item.count} /> reacted to{" "}
          <PostLink post={item.post} />.
        </>
      );
    case "gathering_invite":
      return (
        <>
          <Name actor={item.actor} /> invited you to <GatheringLink item={item} />,{" "}
          {shortWhen(item.gathering.starts_at)}.
        </>
      );
    case "gathering_cancelled":
      return (
        <>
          <Name actor={item.actor} /> cancelled <GatheringLink item={item} />.
        </>
      );
    case "gathering_unplanted":
      return (
        <>
          <GatheringLink item={item} /> was cancelled because its Event Mushroom wasn&apos;t planted
          by the start.
        </>
      );
  }
}

type GatheringItem = Extract<
  NotificationItem,
  { kind: "gathering_invite" | "gathering_cancelled" | "gathering_unplanted" }
>;

function GatheringLink({ item }: { item: GatheringItem }) {
  return (
    <Link
      href={`/gatherings/${item.gathering.id}`}
      className="font-medium text-ink hover:text-accent-600"
    >
      {item.gathering.title}
    </Link>
  );
}

function shortWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** An invitation's answer, right on the notification. Nothing to answer once
 * it's cancelled or has started. */
function InvitationAnswer({ item }: { item: GatheringItem }) {
  if (item.gathering.status === "cancelled") {
    return <p className="mt-2 text-xs text-ink-muted">This gathering was cancelled.</p>;
  }
  if (item.gathering.started) return null;
  return (
    <div className="mt-2">
      <GatheringAnswerButtons
        gatheringId={item.gathering.id}
        initial={item.gathering.my_response}
      />
    </div>
  );
}

/** One line on the Notifications page. An unread line gets a dot, never a count. */
export default function NotificationLine({ item }: { item: NotificationItem }) {
  return (
    <li className="flex gap-3 border-b border-line-soft py-3 last:border-b-0">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.unread ? "bg-accent-500" : ""}`}
      />
      <div className="min-w-0 flex-1">
        {item.unread && <span className="sr-only">New: </span>}
        <p className="text-sm text-ink-secondary">
          <Message item={item} />
        </p>
        {item.kind === "comment" && (
          <p className="mt-1 whitespace-pre-wrap break-words border-l-2 border-line pl-2 text-sm text-ink-tertiary">
            {item.excerpt}
          </p>
        )}
        {item.kind === "friend_request" && <RequestButtons friendshipId={item.friendship_id} />}
        {item.kind === "gathering_invite" && <InvitationAnswer item={item} />}
        <p className="mt-1 text-xs text-ink-faint">{timeAgo(item.created_at)}</p>
      </div>
    </li>
  );
}
