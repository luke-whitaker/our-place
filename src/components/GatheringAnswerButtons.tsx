"use client";

import { useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import type { GatheringAnswer } from "@/lib/types";

interface GatheringAnswerButtonsProps {
  gatheringId: string;
  /** The viewer's answer so far, or null when they haven't got an invite row. */
  initial: GatheringAnswer | null;
  /** The host is always going and can only cancel. */
  isHost?: boolean;
  onAnswered?: (answer: GatheringAnswer) => void;
}

const SAID: Record<GatheringAnswer, string> = {
  accepted: "You're going.",
  declined: "You declined.",
  pending: "You haven't answered yet.",
};

/** Going or not, from a notification or a gathering's page. Both post to the
 * one response route, so an answer shows up everywhere the invitation does,
 * the letter in the mailbox included. Answers can change until it starts. */
export default function GatheringAnswerButtons({
  gatheringId,
  initial,
  isHost = false,
  onAnswered,
}: GatheringAnswerButtonsProps) {
  const [answer, setAnswer] = useState<GatheringAnswer | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (isHost) return <p className="text-xs text-ink-muted">{"You're hosting."}</p>;

  async function respond(response: "accepted" | "declined") {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/gatherings/${gatheringId}/response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      setAnswer(response);
      onAnswered?.(response);
    } catch (err) {
      setError(userMessage(err, "Couldn't save your answer."));
    } finally {
      setBusy(false);
    }
  }

  const button = (response: "accepted" | "declined", label: string, primary: boolean) => (
    <button
      onClick={() => respond(response)}
      disabled={busy || answer === response}
      className={
        primary
          ? "rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-inverse transition-colors hover:bg-accent-600 disabled:opacity-50"
          : "rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-emphasis disabled:opacity-50"
      }
    >
      {label}
    </button>
  );

  return (
    <div>
      {answer && answer !== "pending" && (
        <p className="mb-1 text-xs text-ink-muted">{SAID[answer]}</p>
      )}
      <div className="flex gap-2">
        {button("accepted", answer === "declined" ? "Go after all" : "Accept", true)}
        {button("declined", answer === "accepted" ? "Can't go" : "Decline", false)}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
