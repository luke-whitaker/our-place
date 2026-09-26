"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { ITEM_CATALOG } from "@/lib/items";
import { worldAsset } from "@/lib/game/asset-url";
import { PAL } from "@/lib/game/constants";
import { NPC_DIALOGUE, dialogueLinesFor, type DialogueLine } from "@/lib/game/npc-dialogue";
import type { NpcId } from "@/lib/npcs";
import type { NpcTalkResult, NpcTalkState, PocketItem } from "@/lib/types";

interface WorldDialogueProps {
  npcId: NpcId;
  /** False for a logged-out visitor: the NPC says its visitor lines and no
   * request is made, since talk is a members-only API. */
  signedIn: boolean;
  /** Called once the last line has been advanced past, or Escape closes it
   * from the parent's global listener (see WorldOverlays). */
  onClose: () => void;
}

type TalkFetch =
  | { status: "visitor" }
  | { status: "loading" }
  | { status: "ok"; data: NpcTalkResult }
  | { status: "error"; message: string };

/** One line ready to render: a spoken line (with the NPC's name), or the
 * system line reporting a gift (no name, italic, with the item's icon). */
interface ResolvedLine {
  speaker: string | null;
  text: string;
  icon?: string;
  italic?: boolean;
}

function resolveLine(name: string, line: DialogueLine, item: PocketItem | undefined): ResolvedLine {
  if (line.kind === "say") return { speaker: name, text: line.text };
  if (line.kind === "say-random") {
    const text = line.options[Math.floor(Math.random() * line.options.length)];
    return { speaker: name, text };
  }
  // The gift line: text and icon come from the actually granted item, not
  // authored copy, so this never drifts from what ITEM_CATALOG calls it.
  if (!item) return { speaker: null, text: "Something went into your pockets.", italic: true };
  const catalog = ITEM_CATALOG[item.kind];
  return {
    speaker: null,
    text: `The ${catalog.name} went into your pockets.`,
    icon: catalog.icon,
    italic: true,
  };
}

function resolveLines(npcId: NpcId, state: NpcTalkState, item: PocketItem | undefined) {
  const name = NPC_DIALOGUE[npcId].name;
  return dialogueLinesFor(npcId, state).map((line) => resolveLine(name, line, item));
}

/**
 * <WorldDialogue /> — the bottom-of-screen dialogue box. Opens the moment the
 * engine pauses for a talk, shows "…" while POST /api/npcs/[id]/talk is in
 * flight, then steps through that state's lines. Advances on Enter, Space, or
 * a tap on the panel; the last line closes it, handing control back to
 * WorldOverlays (which resumes the engine and turns the NPC back to its
 * default facing).
 */
export default function WorldDialogue({ npcId, signedIn, onClose }: WorldDialogueProps) {
  const name = NPC_DIALOGUE[npcId].name;
  const [fetchState, setFetchState] = useState<TalkFetch>(
    signedIn ? { status: "loading" } : { status: "visitor" },
  );
  const [lineIndex, setLineIndex] = useState(0);
  // Guards the real, gift-granting POST against React StrictMode's dev-only
  // double effect invocation — without it, a second request could land after
  // the first already granted the gift and read back "after" instead.
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!signedIn || requestedRef.current) return;
    requestedRef.current = true;
    apiFetch<NpcTalkResult>(`/api/npcs/${npcId}/talk`, { method: "POST" })
      .then((data) => setFetchState({ status: "ok", data }))
      .catch((err) => {
        setFetchState({
          status: "error",
          message: userMessage(err, `${name} seems lost in thought. Try again in a moment.`),
        });
      });
  }, [npcId, name, signedIn]);

  // A say-random line (Gnomette's chat) rolls once per fetch, not once per
  // render — recomputing only when fetchState itself changes keeps the same
  // pick on screen while paging back and forth isn't possible anyway, but
  // matters for React re-rendering this component for other reasons.
  const lines = useMemo<ResolvedLine[]>(() => {
    if (fetchState.status === "visitor")
      return NPC_DIALOGUE[npcId].visitor.map((line) => resolveLine(name, line, undefined));
    if (fetchState.status === "ok")
      return resolveLines(npcId, fetchState.data.state, fetchState.data.item);
    if (fetchState.status === "error") return [{ speaker: name, text: fetchState.message }];
    return [{ speaker: name, text: "…" }];
  }, [fetchState, npcId, name]);

  const canAdvance = fetchState.status !== "loading";
  const current = lines[Math.min(lineIndex, lines.length - 1)];
  const hasMore = canAdvance && lineIndex + 1 < lines.length;

  function advance() {
    if (!canAdvance) return;
    if (lineIndex + 1 < lines.length) setLineIndex((i) => i + 1);
    else onClose();
  }

  // A plain window listener, like the rest of the world's input — re-attached
  // every render (no deps array) so `advance` always closes over the current
  // line; the listener itself is cheap enough that this costs nothing.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (e.code !== "Enter" && e.code !== "Space") return;
      e.preventDefault();
      advance();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-2 pb-2 sm:pb-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} says`}
        onClick={advance}
        className="max-h-[75%] w-full max-w-2xl cursor-pointer overflow-y-auto rounded-sm border-2 px-4 py-3 font-mono"
        style={{ backgroundColor: PAL.textBg, borderColor: PAL.textBorder }}
      >
        {current.speaker && (
          <p className="mb-1 text-sm font-bold" style={{ color: PAL.lightest }}>
            {current.speaker}
          </p>
        )}
        <div className="flex items-start gap-3">
          {current.icon && (
            // eslint-disable-next-line @next/next/no-img-element -- a tiny world-art icon, not a Next-optimized asset
            <img
              src={worldAsset(current.icon)}
              crossOrigin="anonymous"
              alt=""
              width={32}
              height={32}
              style={{ imageRendering: "pixelated" }}
              className="shrink-0"
            />
          )}
          <p
            className={`flex-1 text-base leading-snug ${current.italic ? "italic" : ""}`}
            style={{ color: current.italic ? PAL.light : PAL.white }}
          >
            {current.text}
          </p>
        </div>
        {hasMore && (
          <p className="mt-1 text-right text-sm" style={{ color: PAL.light }} aria-hidden="true">
            ▼
          </p>
        )}
      </div>
    </div>
  );
}
