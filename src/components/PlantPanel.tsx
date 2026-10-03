"use client";

import { useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { worldAsset } from "@/lib/game/asset-url";
import { PAL } from "@/lib/game/constants";
import OverlayPanel from "@/components/OverlayPanel";
import OverlayActionButton from "@/components/OverlayActionButton";
import type { PlantFixture } from "@/lib/game/types";
import type { PickedPlant } from "@/lib/types";

interface PlantPanelProps {
  fixture: PlantFixture;
  onClose: () => void;
  /** After the plant came back into pockets, with the server's message. */
  onPicked: (message: string) => void;
}

/**
 * <PlantPanel /> — a member's own seed or flower, with the one thing they can
 * do to it: pick it up. Asked rather than done on Enter, since a garden sits
 * where people walk and a stray press shouldn't uproot it.
 */
export default function PlantPanel({ fixture, onClose, onPicked }: PlantPanelProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bloomed = fixture.color !== null;
  const icon = bloomed ? `/world/items/flower_${fixture.color}.png` : "/world/items/seed.png";

  async function pick() {
    setBusy(true);
    try {
      const data = await apiFetch<PickedPlant>(`/api/world/plants/${fixture.plantId}`, {
        method: "DELETE",
      });
      onPicked(data.message);
    } catch (err) {
      setError(userMessage(err, "Couldn't pick that up."));
      setBusy(false);
    }
  }

  return (
    <OverlayPanel title={bloomed ? "🌼 Your flower" : "🌱 Your seed"} onClose={onClose}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a tiny world-art icon, not a Next-optimized asset */}
        <img
          src={worldAsset(icon)}
          crossOrigin="anonymous"
          alt=""
          width={32}
          height={32}
          className="h-8 w-8"
          style={{ imageRendering: "pixelated" }}
        />
        <p className="text-sm" style={{ color: PAL.light }}>
          {bloomed
            ? "It's in bloom. Pick it to carry it, give it, or wear it."
            : "Still growing. Dig it up and you'll get the seed back."}
        </p>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <OverlayActionButton onClick={() => void pick()} disabled={busy}>
          {bloomed ? "Pick it" : "Dig it up"}
        </OverlayActionButton>
        <OverlayActionButton onClick={onClose} variant="secondary">
          Leave it
        </OverlayActionButton>
      </div>
    </OverlayPanel>
  );
}
