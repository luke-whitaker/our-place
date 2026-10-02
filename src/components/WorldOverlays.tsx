"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import {
  pauseForOverlay,
  resumeFromOverlay,
  endNpcTalk,
  setMailboxFlag,
  getLocalEntity,
  showToast,
  travelEntries,
  chooseTravel,
  type IsoState,
  type MenuEntry,
} from "@/lib/game/iso-engine";
import { frontTile, plantProblem } from "@/lib/game/event-mushroom";
import type { IsoWorld } from "@/lib/game/world-model";
import type { InputManager } from "@/lib/game/input";
import type { NpcId } from "@/lib/npcs";
import type { PocketItem } from "@/lib/types";
import type {
  ArmoireFixture,
  DeskFixture,
  EventMushroomFixture,
  MailboxFixture,
  WorldFixture,
} from "@/lib/game/types";
import GatheringCard, { type GatheringCardTab } from "@/components/GatheringCard";
import WorldDialogue from "@/components/WorldDialogue";
import DialogueBox from "@/components/DialogueBox";
import ArmoirePanel from "@/components/ArmoirePanel";
import DeskPanel from "@/components/DeskPanel";
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
  | { kind: "pockets"; plant: PlantSpot | null }
  | { kind: "notebook" }
  | { kind: "gathering"; fixture: EventMushroomFixture; tab: GatheringCardTab; travel: MenuEntry[] }
  | { kind: "passing-mushroom" }
  | { kind: "mailbox"; fixture: MailboxFixture }
  | { kind: "desk"; fixture: DeskFixture; page: number }
  | { kind: "armoire"; fixture: ArmoireFixture }
  | { kind: "note"; item: PocketItem; returnTo: "pockets" }
  | { kind: "note"; item: PocketItem; returnTo: "mailbox"; fixture: MailboxFixture }
  | { kind: "note"; item: PocketItem; returnTo: "desk"; fixture: DeskFixture; page: number };

/** What a visitor hears at someone else's desk or armoire: both are owner-only. */
const lockedLine = (thing: string) =>
  `Oops! It's locked. You must not have the right key for this ${thing}.`;

/** Where Pockets would plant an Event Mushroom: the tile in front of the
 * player in this world, and why not there (null when it's fine). Worked out
 * when Pockets opens, since the world is paused while it's open. `now` is
 * that moment, so the panel can tell a gathering that already started. */
export interface PlantSpot {
  worldId: string;
  col: number;
  row: number;
  problem: string | null;
  now: number;
}

/** The screen a fixture opens once its confirm finishes. The desk opens on
 * its first page; who sees what (owner or visitor) is decided at render. An
 * Event Mushroom opens its card for a guest and one line for anyone else. */
export function fixtureScreen(fixture: WorldFixture): OverlayScreen {
  if (fixture.kind === "desk") return { kind: "desk", fixture, page: 0 };
  if (fixture.kind === "armoire") return { kind: "armoire", fixture };
  if (fixture.kind === "event_mushroom") {
    return fixture.invited
      ? { kind: "gathering", fixture, tab: "gathering", travel: [] }
      : { kind: "passing-mushroom" };
  }
  return { kind: "mailbox", fixture };
}

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
  /** After a mushroom is planted or picked up here: reload what stands in
   * this world and the network's Gatherings list. */
  onMushroomsChange: () => void;
  /** After an invitation is answered from a mushroom's card. */
  onGatheringsChange: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/** Whether the signed-in member owns this mailbox, desk, or armoire, rather than
 * visiting — usernames are lowercase by construction, but compared
 * case-insensitively anyway to match every other username comparison in the
 * app (e.g. the leave-a-letter route). */
function isOwner(fixture: WorldFixture, username: string | null): boolean {
  return username !== null && username.toLowerCase() === fixture.owner.toLowerCase();
}

/** Where the note reader's Back goes: the screen the note was opened from,
 * on the same desk page. `pockets` is Pockets as it would open now. */
function noteReturn(
  note: Extract<OverlayScreen, { kind: "note" }>,
  pockets: OverlayScreen,
): OverlayScreen {
  if (note.returnTo === "mailbox") return { kind: "mailbox", fixture: note.fixture };
  if (note.returnTo === "desk") return { kind: "desk", fixture: note.fixture, page: note.page };
  return pockets;
}

/** What a passer-by learns at a gathering they weren't invited to. */
const PASSING_LINE = "A gathering is happening here.";

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
  onMushroomsChange,
  onGatheringsChange,
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

  /** Pockets as it opens right now, with the spot a mushroom would be planted
   * on: the tile in front of the player, checked by the same rule the server
   * uses. Only ever called from an event handler, since it reads the state. */
  function pocketsScreen(): OverlayScreen {
    const state = stateRef.current;
    if (!state) return { kind: "pockets", plant: null };
    const player = getLocalEntity(state);
    const tile = frontTile(player.col, player.row, player.dir);
    const plant: PlantSpot = {
      worldId: world.id,
      ...tile,
      problem: plantProblem(world, tile.col, tile.row),
      now: Date.now(),
    };
    return { kind: "pockets", plant };
  }

  function openPockets() {
    const state = stateRef.current;
    // Only from a plain, unpaused world — never steals a fade or an
    // in-progress PC/shrine menu, which are separate engine modes with their
    // own resume path that pauseForOverlay would otherwise clobber.
    if (!state || overlay.kind !== "none" || state.mode !== "overworld") return;
    pauseForOverlay(state);
    setOverlay(pocketsScreen());
  }

  /** Back to the world with a toast, the way every mushroom action reports. */
  function closeWithToast(text: string) {
    closeToWorld();
    const state = stateRef.current;
    if (state) showToast(state, text);
  }

  async function plantMushroom(item: PocketItem, spot: PlantSpot) {
    try {
      const data = await apiFetch<{ message: string }>(
        `/api/gatherings/${item.gathering_id}/mushroom`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ world: spot.worldId, col: spot.col, row: spot.row }),
        },
      );
      closeWithToast(data.message);
      onMushroomsChange();
    } catch (err) {
      closeWithToast(userMessage(err, "Couldn't plant the mushroom."));
    }
  }

  /** Switch the card's tab. Travel reads the network's rows now, in this
   * handler, since the engine state can't be read while rendering. */
  function showCardTab(fixture: EventMushroomFixture, tab: GatheringCardTab) {
    const state = stateRef.current;
    const travel = tab === "travel" && state ? travelEntries(state, world) : [];
    setOverlay({ kind: "gathering", fixture, tab, travel });
  }

  /** Take a Travel row: the engine leaves the pause and commits it like the
   * shrine menu would, so the card just gets out of the way. */
  function travelFromMushroom(entry: MenuEntry) {
    const state = stateRef.current;
    if (state) chooseTravel(state, entry);
    inputRef.current.consume("Enter");
    inputRef.current.consume("Space");
    setOverlay({ kind: "none" });
    blurActiveElement();
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
          plant={overlay.plant}
          onPlant={(item, spot) => void plantMushroom(item, spot)}
        />
      )}
      {overlay.kind === "notebook" && <NotebookPanel onClose={() => setOverlay(pocketsScreen())} />}
      {overlay.kind === "gathering" && (
        <GatheringCard
          gatheringId={overlay.fixture.gatheringId}
          tab={overlay.tab}
          travel={overlay.travel}
          onTab={(tab) => showCardTab(overlay.fixture, tab)}
          onTravel={travelFromMushroom}
          onClose={closeToWorld}
          onPickedUp={(message) => {
            closeWithToast(message);
            onMushroomsChange();
          }}
          onAnswered={onGatheringsChange}
        />
      )}
      {overlay.kind === "passing-mushroom" && (
        // No request: a passer-by learns only that something's happening.
        <DialogueBox
          speaker={null}
          text={PASSING_LINE}
          italic
          hasMore={false}
          ariaLabel="The Event Mushroom"
          onAdvance={closeToWorld}
        />
      )}
      {overlay.kind === "mailbox" &&
        (isOwner(overlay.fixture, username) ? (
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
      {overlay.kind === "desk" &&
        (isOwner(overlay.fixture, username) ? (
          <DeskPanel
            initialPage={overlay.page}
            onClose={closeToWorld}
            onReadNote={(item, page) =>
              setOverlay({ kind: "note", item, returnTo: "desk", fixture: overlay.fixture, page })
            }
          />
        ) : (
          // No request: the desk's routes only ever reach the caller's own
          // items, so there's nothing a visitor could open anyway.
          <DialogueBox
            speaker={null}
            text={lockedLine("desk")}
            italic
            hasMore={false}
            ariaLabel="The desk"
            onAdvance={closeToWorld}
          />
        ))}
      {overlay.kind === "armoire" &&
        (isOwner(overlay.fixture, username) ? (
          <ArmoirePanel onClose={closeToWorld} />
        ) : (
          // No request, like the desk: the armoire's routes only ever reach
          // the caller's own outfits.
          <DialogueBox
            speaker={null}
            text={lockedLine("armoire")}
            italic
            hasMore={false}
            ariaLabel="The armoire"
            onAdvance={closeToWorld}
          />
        ))}
      {overlay.kind === "note" && (
        <NoteReader
          item={overlay.item}
          returnTo={overlay.returnTo}
          onBack={() => setOverlay(noteReturn(overlay, pocketsScreen()))}
        />
      )}
    </>
  );
}
