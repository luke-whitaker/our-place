"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import {
  pauseForOverlay,
  resumeFromOverlay,
  endNpcTalk,
  type IsoState,
} from "@/lib/game/iso-engine";
import type { IsoWorld } from "@/lib/game/world-model";
import type { InputManager } from "@/lib/game/input";
import type { NpcId } from "@/lib/npcs";
import type { PocketItem } from "@/lib/types";
import WorldDialogue from "@/components/WorldDialogue";
import PocketsPanel from "@/components/PocketsPanel";
import NotebookPanel from "@/components/NotebookPanel";
import NoteReader from "@/components/NoteReader";

/** Which DOM overlay (if any) covers the world right now, and the data each
 * one needs. A single piece of state instead of one boolean per panel, so
 * WorldCanvas has exactly one thing to gate its own chrome on, and there's
 * never a way for two panels to be "open" at once. */
export type OverlayScreen =
  | { kind: "none" }
  | { kind: "dialogue"; npcId: NpcId }
  | { kind: "pockets" }
  | { kind: "notebook" }
  | { kind: "note"; item: PocketItem };

interface WorldOverlaysProps {
  stateRef: RefObject<IsoState | null>;
  world: IsoWorld;
  /** A ref to the same InputManager WorldCanvas's game loop reads, so this
   * only ever dereferences it inside an event handler, never during render
   * (react-hooks/refs). Closing an overlay clears its pending Enter/Space
   * here — see closeToWorld for why. */
  inputRef: RefObject<InputManager>;
  overlay: OverlayScreen;
  setOverlay: (screen: OverlayScreen) => void;
  /** False for a logged-out visitor of the public Capital or a community
   * room. Pockets are members-only, so the 👖 button and P key are absent,
   * and NPCs greet the visitor without calling the talk API. */
  signedIn: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/** Blur whatever holds focus so a keyboard Enter goes back to the world
 * instead of re-clicking whatever DOM control the overlay left focused (see
 * "Keyboard focus belongs to the world" in the world-engine rules). */
function blurActiveElement(): void {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

/**
 * <WorldOverlays /> — every DOM panel that pauses the world: NPC dialogue,
 * Pockets, the Notebook, and the note reader. Owns navigation between them
 * (which screen is showing) and the pause/resume calls into the engine; each
 * panel component owns its own fetches and ephemeral UI state (the fetched
 * items, the editor text, an inline confirmation).
 *
 * Pausing: opening Pockets (the only entry point that isn't already inside an
 * overlay) calls pauseForOverlay directly here. "dialogue" arrives already
 * paused — the engine calls pauseForOverlay itself the instant an NPC confirm
 * finishes (see update() in iso-engine.ts), before this component ever sees
 * it. Either way, closing back to the world calls resumeFromOverlay exactly
 * once — or endNpcTalk, which also turns the NPC back to its default facing.
 */
export default function WorldOverlays({
  stateRef,
  world,
  inputRef,
  overlay,
  setOverlay,
  signedIn,
}: WorldOverlaysProps) {
  function closeToWorld() {
    const state = stateRef.current;
    if (state) {
      if (overlay.kind === "dialogue") endNpcTalk(state, world, overlay.npcId);
      else resumeFromOverlay(state);
    }
    // The engine's own InputManager is still attached and watching every
    // keydown, including the Enter (or Space) that just closed this overlay
    // — clear it here, synchronously, in the same event that resumes the
    // world. Without this, that same physical press sits queued until the
    // next tick, which reads it as a fresh Enter at whatever door, PC, or NPC
    // the player still happens to be standing next to, instantly reopening
    // what was just closed.
    inputRef.current.consume("Enter");
    inputRef.current.consume("Space");
    setOverlay({ kind: "none" });
    blurActiveElement();
  }

  function openPockets() {
    const state = stateRef.current;
    // Only from a plain, unpaused world — never steals a fade or an
    // in-progress PC/shrine menu, which are separate engine modes with their
    // own resume path that pauseForOverlay would otherwise clobber.
    if (!state || overlay.kind !== "none" || state.mode !== "overworld") return;
    pauseForOverlay(state);
    setOverlay({ kind: "pockets" });
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "KeyP" && signedIn && !isTypingTarget(e.target)) {
        if (overlay.kind === "none") openPockets();
        else if (overlay.kind === "pockets") closeToWorld();
        return;
      }
      if (overlay.kind !== "none" && e.code === "Escape") closeToWorld();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // Re-registered on every overlay change so the handler always closes over
    // the current screen; a window listener is cheap enough that memoizing
    // this buys nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay]);

  return (
    <>
      {overlay.kind === "none" && signedIn && (
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            openPockets();
          }}
          aria-label="Pockets"
          title="Pockets"
          className="absolute right-16 top-2 z-[5] flex h-11 w-11 touch-manipulation select-none items-center justify-center rounded-full border border-white/25 bg-surface/10 text-xl hover:bg-surface/20 active:bg-surface/25"
        >
          👖
        </button>
      )}
      {overlay.kind === "dialogue" && (
        <WorldDialogue npcId={overlay.npcId} signedIn={signedIn} onClose={closeToWorld} />
      )}
      {overlay.kind === "pockets" && (
        <PocketsPanel
          onClose={closeToWorld}
          onOpenNotebook={() => setOverlay({ kind: "notebook" })}
          onReadNote={(item) => setOverlay({ kind: "note", item })}
        />
      )}
      {overlay.kind === "notebook" && (
        <NotebookPanel onClose={() => setOverlay({ kind: "pockets" })} />
      )}
      {overlay.kind === "note" && (
        <NoteReader item={overlay.item} onBack={() => setOverlay({ kind: "pockets" })} />
      )}
    </>
  );
}
