"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, userMessage } from "@/lib/api-client";
import { PAL } from "@/lib/game/constants";
import { gatheringWhen, WORLD_TIME_ZONE } from "@/lib/time-utils";
import OverlayPanel from "@/components/OverlayPanel";
import OverlayActionButton from "@/components/OverlayActionButton";
import type { MenuEntry } from "@/lib/game/iso-engine";
import type { GatheringAnswer, GatheringDetail } from "@/lib/types";

export type GatheringCardTab = "gathering" | "travel";

interface GatheringCardProps {
  gatheringId: string;
  tab: GatheringCardTab;
  /** The network's destinations, read when the Travel tab opened. */
  travel: MenuEntry[];
  onTab: (tab: GatheringCardTab) => void;
  onTravel: (entry: MenuEntry) => void;
  onClose: () => void;
  /** After the host picks the mushroom up: it's back in their pockets. */
  onPickedUp: (message: string) => void;
  /** After an answer, so the network's Gatherings list can catch up. */
  onAnswered: () => void;
}

/**
 * <GatheringCard /> — what an Event Mushroom opens for its guests. The
 * Gathering tab shows the gathering (in Chicago time, like the letters) with
 * Accept / Decline, and Pick up for the host before the start. The Travel tab
 * makes the mushroom a node on the Mycelium Network: the same rows a shrine
 * offers, committed through the engine (chooseTravel), so the journey is the
 * shrine's own fade.
 */
export default function GatheringCard({
  gatheringId,
  tab,
  travel,
  onTab,
  onTravel,
  onClose,
  onPickedUp,
  onAnswered,
}: GatheringCardProps) {
  return (
    <OverlayPanel title="🍄 Event Mushroom" onClose={onClose}>
      <div className="flex gap-1" role="tablist">
        {(["gathering", "travel"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
            className="min-h-11 flex-1 touch-manipulation rounded-sm border text-sm font-bold active:opacity-60"
            style={{
              borderColor: PAL.textBorder,
              color: tab === t ? PAL.white : PAL.light,
              backgroundColor: tab === t ? "rgba(238,228,218,0.12)" : "transparent",
            }}
          >
            {t === "gathering" ? "Gathering" : "Travel"}
          </button>
        ))}
      </div>
      {tab === "gathering" ? (
        <GatheringTab gatheringId={gatheringId} onPickedUp={onPickedUp} onAnswered={onAnswered} />
      ) : (
        <TravelTab entries={travel} onTravel={onTravel} />
      )}
    </OverlayPanel>
  );
}

function TravelTab({
  entries,
  onTravel,
}: {
  entries: MenuEntry[];
  onTravel: (entry: MenuEntry) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-1">
      {entries.map((entry, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onTravel(entry)}
          className="min-h-11 touch-manipulation rounded-sm border px-2 py-1.5 text-sm leading-tight active:opacity-60"
          style={{ borderColor: PAL.textBorder, color: PAL.light }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

function GatheringTab({
  gatheringId,
  onPickedUp,
  onAnswered,
}: {
  gatheringId: string;
  onPickedUp: (message: string) => void;
  onAnswered: () => void;
}) {
  const [gathering, setGathering] = useState<GatheringDetail | null>(null);
  const [answer, setAnswer] = useState<GatheringAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ gathering: GatheringDetail }>(`/api/gatherings/${gatheringId}`)
      .then((data) => {
        if (cancelled) return;
        setGathering(data.gathering);
        setAnswer(data.gathering.my_response);
      })
      .catch((err) => {
        if (!cancelled) setError(userMessage(err, "Couldn't load this gathering."));
      });
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
      onAnswered();
    } catch (err) {
      setError(userMessage(err, "Couldn't save your answer."));
    } finally {
      setBusy(false);
    }
  }

  async function pickUp() {
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch<{ message: string }>(`/api/gatherings/${gatheringId}/mushroom`, {
        method: "DELETE",
      });
      onPickedUp(data.message);
    } catch (err) {
      setError(userMessage(err, "Couldn't pick up the mushroom."));
      setBusy(false);
    }
  }

  if (error && !gathering) return <p className="text-sm text-red-400">{error}</p>;
  if (!gathering) {
    return (
      <p className="text-sm" style={{ color: PAL.light }}>
        Loading...
      </p>
    );
  }

  const canAnswer = !gathering.started && !gathering.is_host;
  const status = gathering.is_host
    ? "You're hosting this one."
    : answer === "accepted"
      ? "You're going."
      : answer === "declined"
        ? "You declined."
        : "You haven't answered yet.";
  const going = gathering.going.map((p) => p.display_name).join(", ");

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-bold" style={{ color: PAL.lightest }}>
        {gathering.title}
      </p>
      <p className="text-xs" style={{ color: PAL.light }}>
        {gatheringWhen(gathering.starts_at, gathering.ends_at, WORLD_TIME_ZONE)}
      </p>
      <p className="text-xs" style={{ color: PAL.light }}>
        Hosted by {gathering.host.display_name}
      </p>
      <p className="text-xs" style={{ color: PAL.light }}>
        Going: {going || "nobody yet"}
      </p>
      <p className="text-xs" style={{ color: PAL.white }}>
        {status}{" "}
        <Link href={`/gatherings/${gatheringId}`} className="underline">
          Details
        </Link>
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {canAnswer && (
        <div className="mt-1 flex gap-2">
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
      {gathering.is_host && !gathering.started && (
        <div className="mt-1 flex gap-2">
          <OverlayActionButton onClick={pickUp} disabled={busy}>
            Pick up
          </OverlayActionButton>
        </div>
      )}
    </div>
  );
}
