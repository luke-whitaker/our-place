"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiFetch, userMessage } from "@/lib/api-client";
import { PAL } from "@/lib/game/constants";
import { gatheringWhen } from "@/lib/time-utils";
import OverlayActionButton from "@/components/OverlayActionButton";
import type { GatheringAnswer, GatheringDetail } from "@/lib/types";

/**
 * The invitation inside an invitation letter: the gathering's name and time,
 * and Accept / Decline. It reads the gathering fresh each time the letter is
 * opened, so an answer given from the notification shows here too. Someone
 * the letter was handed to, who can't see the gathering, gets a 404 and sees
 * only the letter's words; the address is never shown in the world at all.
 */
export default function LetterInvitation({ gatheringId }: { gatheringId: string }) {
  const [gathering, setGathering] = useState<GatheringDetail | null>(null);
  const [answer, setAnswer] = useState<GatheringAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ gathering: GatheringDetail }>(
          `/api/gatherings/${gatheringId}`,
        );
        if (cancelled) return;
        setGathering(data.gathering);
        setAnswer(data.gathering.my_response);
      } catch (err) {
        // Not invited (the letter was passed on) or the gathering is gone:
        // the letter stays readable, with nothing to answer.
        if (cancelled || (err instanceof ApiError && err.status === 404)) return;
        setError(userMessage(err, "Couldn't load this invitation."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gatheringId]);

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
    } catch (err) {
      setError(userMessage(err, "Couldn't save your answer."));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!gathering) return null;

  const started = gathering.started;
  const status =
    gathering.status === "cancelled"
      ? "This gathering was cancelled."
      : gathering.is_host
        ? "You're hosting this one."
        : answer === "accepted"
          ? "You're going."
          : answer === "declined"
            ? "You declined."
            : "You haven't answered yet.";
  const canAnswer = gathering.status === "scheduled" && !started && !gathering.is_host;

  return (
    <div className="rounded-sm border p-2" style={{ borderColor: PAL.textBorder }}>
      <p className="text-sm font-bold" style={{ color: PAL.lightest }}>
        {gathering.title}
      </p>
      <p className="text-xs" style={{ color: PAL.light }}>
        {gatheringWhen(gathering.starts_at, gathering.ends_at)}
      </p>
      <p className="mt-1 text-xs" style={{ color: PAL.white }}>
        {status}{" "}
        <Link href={`/gatherings/${gatheringId}`} className="underline">
          Details
        </Link>
      </p>
      {canAnswer && (
        <div className="mt-2 flex gap-2">
          <OverlayActionButton
            onClick={() => respond("accepted")}
            disabled={busy || answer === "accepted"}
          >
            Accept
          </OverlayActionButton>
          <OverlayActionButton
            onClick={() => respond("declined")}
            variant="secondary"
            disabled={busy || answer === "declined"}
          >
            Decline
          </OverlayActionButton>
        </div>
      )}
    </div>
  );
}
