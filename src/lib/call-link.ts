// The browser's side of a voice call: one LiveKit room at a time, with no
// React in it. CallProvider owns one link for the whole site, so moving
// between the forum and the world (or through a door) never drops the call.
//
// Tokens: our token route mints one that lasts 10 minutes, but the client
// never asks for another while connected. LiveKit's server sends the client a
// refreshed token over the call's own connection, and the SDK reconnects with
// that one. Only a rejoin after a drop asks our route again, which is also
// where the server re-checks Ghost Mode, blocks, and the size cap.

import {
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
} from "livekit-client";

export type CallLinkStatus = "idle" | "connecting" | "connected" | "reconnecting";

/** Why a call ended without this member pressing Leave. */
export type CallEndReason = "removed" | "ended" | "dropped";

export interface CallLinkState {
  status: CallLinkStatus;
  /** The call this link is in (or joining), else null. */
  callId: string | null;
  /** Whether this member's microphone is sending. */
  micOn: boolean;
  /** User ids of whoever is talking right now, this member included. */
  speaking: ReadonlySet<string>;
  /** User ids of the others connected to the call's audio. */
  connected: ReadonlySet<string>;
  /** The browser refused to play audio until another tap (Safari, mostly). */
  audioBlocked: boolean;
  /** When this connection was made (Date.now()), 0 when not connected. The
   * server counted this member in before this moment. */
  joinedAt: number;
}

/** What joining needs from our server: which call, and LiveKit's address
 * and token for it. */
export interface CallTicket {
  callId: string;
  url: string;
  token: string;
}

/** Joining failed. `micDenied` is the browser (or the member) refusing the
 * microphone, which the UI explains differently from anything else. */
export class CallJoinError extends Error {
  constructor(
    message: string,
    readonly micDenied: boolean,
  ) {
    super(message);
    this.name = "CallJoinError";
  }
}

type EndListener = (callId: string, reason: CallEndReason) => void;

export interface CallLink {
  getState(): CallLinkState;
  subscribe(listener: () => void): () => void;
  /** Hear about ends this member didn't choose. Returns the unsubscribe. */
  onEnd(listener: EndListener): () => void;
  /** Connect to a call and open the microphone. Call it from the tap that
   * means "join" or "start": it unlocks audio playback before its first
   * await, and only then asks `getTicket` for the call and its token. */
  join(getTicket: () => Promise<CallTicket>): Promise<void>;
  /** Hang up. Never reports an end reason: the member chose this. */
  leave(): Promise<void>;
  setMic(on: boolean): Promise<void>;
  /** Mute one person for this member only. Remembered by the caller. */
  setMemberMuted(userId: string, muted: boolean): void;
  /** Retry audio playback from a tap, after `audioBlocked`. */
  startAudio(): Promise<void>;
  /** After the page comes back into view: iOS suspends the microphone of a
   * page in the background, and the track comes back ended. Report it as a
   * drop so the member can rejoin, rather than sending silence. */
  checkMicAfterReturn(): void;
  /** Hang up because the server no longer counts this member in the call
   * (a removal LiveKit didn't deliver, or a heartbeat that went stale). */
  endBecause(reason: CallEndReason): void;
}

export const CALL_LINK_IDLE: CallLinkState = {
  status: "idle",
  callId: null,
  micOn: false,
  speaking: new Set(),
  connected: new Set(),
  audioBlocked: false,
  joinedAt: 0,
};

/** Where remote voices play: one hidden element per voice, under <body>, so
 * no page's layout ever owns them. */
function audioContainer(): HTMLElement {
  const id = "op-call-audio";
  const existing = document.getElementById(id);
  if (existing) return existing;
  const el = document.createElement("div");
  el.id = id;
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

function isMicDenied(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === "NotAllowedError" || error.name === "NotFoundError")
  );
}

function reasonFor(reason: DisconnectReason | undefined): CallEndReason {
  if (reason === DisconnectReason.PARTICIPANT_REMOVED) return "removed";
  if (reason === DisconnectReason.ROOM_DELETED) return "ended";
  return "dropped";
}

/**
 * One link for the site. Listeners added with `onEnd` hear about every end
 * this member didn't choose: removed by the server (Ghost Mode, a block), the
 * call ended, or the connection lost for good after LiveKit's own reconnect
 * attempts.
 */
export function createCallLink(initiallyMuted: Iterable<string> = []): CallLink {
  let state: CallLinkState = CALL_LINK_IDLE;
  let room: Room | null = null;
  const listeners = new Set<() => void>();
  const endListeners = new Set<EndListener>();
  const mutedMembers = new Set<string>(initiallyMuted);

  function onEnd(callId: string, reason: CallEndReason) {
    for (const listener of endListeners) listener(callId, reason);
  }

  function set(patch: Partial<CallLinkState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }

  function reset() {
    set(CALL_LINK_IDLE);
  }

  function remoteIds(r: Room): Set<string> {
    return new Set([...r.remoteParticipants.values()].map((p) => p.identity));
  }

  function applyVolume(participant: RemoteParticipant) {
    participant.setVolume(mutedMembers.has(participant.identity) ? 0 : 1);
  }

  /** Close a room this link has finished with: stop the microphone, drop its
   * audio elements, and forget it. Safe to call twice. */
  function teardown(r: Room) {
    r.removeAllListeners();
    for (const participant of r.remoteParticipants.values()) {
      for (const pub of participant.audioTrackPublications.values()) pub.track?.detach();
    }
    audioContainer().replaceChildren();
    if (room === r) room = null;
  }

  function watch(r: Room, callId: string) {
    r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio) return;
      audioContainer().appendChild(track.attach());
      applyVolume(participant);
    })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        for (const el of track.detach()) el.remove();
      })
      .on(RoomEvent.ParticipantConnected, () => set({ connected: remoteIds(r) }))
      .on(RoomEvent.ParticipantDisconnected, () => set({ connected: remoteIds(r) }))
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) =>
        set({ speaking: new Set(speakers.map((p) => p.identity)) }),
      )
      .on(RoomEvent.AudioPlaybackStatusChanged, () => set({ audioBlocked: !r.canPlaybackAudio }))
      .on(RoomEvent.Reconnecting, () => set({ status: "reconnecting" }))
      .on(RoomEvent.Reconnected, () => set({ status: "connected" }))
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        // Our own leave() tears down before disconnecting, so only ends this
        // member didn't choose arrive here. A failure while still joining is
        // join()'s to report, as an error from the tap that started it.
        if (state.status === "connecting") return;
        teardown(r);
        reset();
        onEnd(callId, reasonFor(reason));
      });
  }

  async function join(getTicket: () => Promise<CallTicket>): Promise<void> {
    const r = new Room({
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    // Before any await, while the tap still counts as a user gesture: Safari
    // only lets a page start playing audio from one. A refusal here isn't an
    // error to report: it shows up as `audioBlocked` once connected, with a
    // button to try again from a fresh tap.
    r.startAudio().catch(() => undefined);
    if (room) await leave();
    room = r;
    set({ ...CALL_LINK_IDLE, status: "connecting" });
    try {
      const ticket = await getTicket();
      if (room !== r) throw new CallJoinError("Joining was cancelled.", false);
      set({ callId: ticket.callId });
      watch(r, ticket.callId);
      await r.connect(ticket.url, ticket.token);
      await r.localParticipant.setMicrophoneEnabled(true);
      // leave() during the awaits above already reset this link.
      if (room !== r) throw new CallJoinError("Joining was cancelled.", false);
    } catch (error) {
      teardown(r);
      await r.disconnect();
      if (room === null && state.status === "connecting") reset();
      if (isMicDenied(error)) {
        throw new CallJoinError("The browser blocked the microphone.", true);
      }
      throw error;
    }
    set({
      status: "connected",
      micOn: true,
      connected: remoteIds(r),
      audioBlocked: !r.canPlaybackAudio,
      joinedAt: Date.now(),
    });
  }

  async function leave(): Promise<void> {
    const r = room;
    if (!r) return;
    teardown(r);
    reset();
    await r.disconnect();
  }

  /** Hang up for a reason this member didn't choose, and report it like any
   * other such end. */
  function endBecause(reason: CallEndReason) {
    const r = room;
    const callId = state.callId;
    if (!r || !callId) return;
    teardown(r);
    reset();
    // Disconnecting can only fail on a connection that's already gone, which
    // is the state we want anyway.
    r.disconnect().catch(() => undefined);
    onEnd(callId, reason);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onEnd(listener) {
      endListeners.add(listener);
      return () => endListeners.delete(listener);
    },
    join,
    leave,
    async setMic(on) {
      if (!room) return;
      await room.localParticipant.setMicrophoneEnabled(on);
      set({ micOn: on });
    },
    setMemberMuted(userId, muted) {
      if (muted) mutedMembers.add(userId);
      else mutedMembers.delete(userId);
      const participant = room?.remoteParticipants.get(userId);
      if (participant) applyVolume(participant);
    },
    async startAudio() {
      if (!room) return;
      await room.startAudio();
      set({ audioBlocked: !room.canPlaybackAudio });
    },
    checkMicAfterReturn() {
      if (!room || state.status !== "connected" || !state.micOn) return;
      const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
      if (track?.mediaStreamTrack.readyState === "ended") endBecause("dropped");
    },
    endBecause,
  };
}
