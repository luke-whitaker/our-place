"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import {
  pauseForOverlay,
  resumeFromOverlay,
  endNpcTalk,
  setMailboxFlag,
  type IsoState,
} from "@/lib/game/iso-engine";
import type { IsoWorld } from "@/lib/game/world-model";
import type { InputManager } from "@/lib/game/input";
import type { NpcId } from "@/lib/npcs";
import type { PocketItem } from "@/lib/types";
import type { WorldFixture } from "@/lib/game/types";
import WorldDialogue from "@/components/WorldDialogue";
import PocketsPanel from "@/components/PocketsPanel";
import NotebookPanel from "@/components/NotebookPanel";
import NoteReader from "@/components/NoteReader";
import MailboxPanel from "@/components/MailboxPanel";
import LeaveLetterPanel from "@/components/LeaveLetterPanel";

/** Which DOM overlay (if any) covers the world right now, and the data each
 * one needs. A single piece of state instead of one boolean per panel, so
 * WorldCanvas has exactly one thing to gate its own chrome on, and there's
 * never a way for two panels to be "open" at once.
 *
 * A note's `returnTo` carries the fixture along with it in the "mailbox"
 * case (rather than a bare string tag) so closing back to the mailbox never
 * needs a defensive lookup for a fixture that "should" still be there. */
export type OverlayScreen =
  | { kind: "none" }
  | { kind: "dialogue"; npcId: NpcId }
  | { kind: "pockets" }
  | { kind: "notebook" }
  | { kind: "mailbox"; fixture: WorldFixture }
  | { kind: "note"; item: PocketItem; returnTo: "pockets" }
  | { kind: "note"; item: PocketItem; returnTo: "mailbox"; fixture: WorldFixture };

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
  /** The signed-in member's own username, so a mailbox screen can tell owner
   * from visitor by comparing it against the fixture's `owner`. Null when
   * signed out; a mailbox is never actually reachable then (an island needs
   * an account to render at all), but the type stays honest about what's
   * known here rather than assuming a caller always has one. */
  username: string | null;
  /** The island owner's display name, threaded down from the world page —
   * the fixture itself only carries their username. Blank outside an
   * island, where no fixture ever opens this screen. */
  ownerDisplayName: string;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/** Whether the signed-in member is this mailbox's own owner, rather than a
 * visitor — usernames are lowercase by construction, but compared
 * case-insensitively anyway to match every other username comparison in the
 * app (e.g. the leave-a-letter route). */
function isOwnMailbox(fixture: WorldFixture, username: string | null): boolean {
  return username !== null && username.toLowerCase() === fixture.owner.toLowerCase();
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
  username,
  ownerDisplayName,
}: WorldOverlaysProps) {
  /** Both mailbox panels report back through this after every load and every
   * mutation, so the flag on the world stays exactly what's really inside —
   * the same thing anyone else walking by would see. */
  function updateMailboxFlag(hasMail: boolean) {
    const state = stateRef.current;
    if (state) setMailboxFlag(state, hasMail);
  }

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
          onReadNote={(item) => setOverlay({ kind: "note", item, returnTo: "pockets" })}
        />
      )}
      {overlay.kind === "notebook" && (
        <NotebookPanel onClose={() => setOverlay({ kind: "pockets" })} />
      )}
      {overlay.kind === "mailbox" &&
        (isOwnMailbox(overlay.fixture, username) ? (
          <MailboxPanel
            onClose={closeToWorld}
            onReadLetter={(item) =>
              setOverlay({ kind: "note", item, returnTo: "mailbox", fixture: overlay.fixture })
            }
            onMailChange={updateMailboxFlag}
          />
        ) : (
          <LeaveLetterPanel
            fixture={overlay.fixture}
            ownerDisplayName={ownerDisplayName}
            onClose={closeToWorld}
            onMailChange={updateMailboxFlag}
          />
        ))}
      {overlay.kind === "note" && (
        <NoteReader
          item={overlay.item}
          returnTo={overlay.returnTo}
          onBack={() =>
            setOverlay(
              overlay.returnTo === "mailbox"
                ? { kind: "mailbox", fixture: overlay.fixture }
                : { kind: "pockets" },
            )
          }
        />
      )}
    </>
  );
}
