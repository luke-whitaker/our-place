"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ApiError, apiFetch, userMessage } from "@/lib/api-client";
import {
  CallJoinError,
  type CallEndReason,
  type CallLinkState,
  type CallTicket,
} from "@/lib/call-link";
import { useCallLink } from "@/lib/use-call-link";
import { useCallsPoll } from "@/lib/use-calls-poll";
import { useMutedMembers } from "@/lib/use-muted-members";
import type { CallInvitation, CallTokenResponse, CurrentCall } from "@/lib/types";

export const MIC_DENIED =
  "Your browser blocked the microphone. Allow it in the address bar's site settings, then tap Join again.";
export const GHOST_NO_CALLS =
  "Ghost Mode is on, so you can't be in a call. Turn it off at your armoire first.";
/** A removal (Ghost Mode, a block) reads the same as any other, never naming why. */
const LEFT_THE_CALL = "You left the call.";
const CALL_ENDED = "The call ended.";

export interface CallContextValue {
  /** Voice is on for this member: signed in, and the server has LiveKit keys. */
  enabled: boolean;
  ghost: boolean;
  /** The call the server counts this member in, as of the last poll. */
  call: CurrentCall | null;
  /** Open invitations whose toast is still up. */
  invitations: CallInvitation[];
  link: CallLinkState;
  /** A call this member dropped out of (or reloaded away from) and may rejoin. */
  rejoinCallId: string | null;
  /** A calm line or an error to show, until dismissed or replaced. */
  notice: string;
  /** Polls have failed while connected, so the call may drop. */
  unreachable: boolean;
  busy: boolean;
  muted: ReadonlySet<string>;
  start(usernames: string[]): Promise<boolean>;
  join(callId: string): void;
  rejoin(): void;
  decline(callId: string): void;
  hideInvitation(callId: string): void;
  leave(): void;
  invite(usernames: string[]): Promise<boolean>;
  toggleMic(): void;
  toggleMuted(userId: string): void;
  startAudio(): void;
  dismissRejoin(): void;
  dismissNotice(): void;
}

const CallContext = createContext<CallContextValue | null>(null);

/** The call state and actions, for anything under CallProvider. */
export function useCalls(): CallContextValue {
  const value = useContext(CallContext);
  if (!value) throw new Error("useCalls must be used inside CallProvider.");
  return value;
}

/** Ask our server for a seat in a call: a token for LiveKit. */
async function tokenFor(callId: string): Promise<CallTicket> {
  const t = await apiFetch<CallTokenResponse>(`/api/calls/${encodeURIComponent(callId)}/token`, {
    method: "POST",
  });
  return { callId: t.call_id, url: t.url, token: t.token };
}

function postTo(callId: string, action: "leave" | "decline") {
  return apiFetch(`/api/calls/${encodeURIComponent(callId)}/${action}`, { method: "POST" });
}

/**
 * Voice calls for the whole site, mounted once in the root layout so a call
 * survives every client-side navigation: forum to world, through doors, and
 * across warps. Holds the server's view (polled) and the live connection (the
 * link), and every action a button can take.
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const signedIn = !!user?.avatar;

  // Ends this member didn't choose. The link calls this from its own events,
  // never from a render or an effect body.
  const [notice, setNotice] = useState("");
  const [dropped, setDropped] = useState<string | null>(null);
  // Calls this member left, declined, or was removed from: never offered for
  // rejoining from a poll that hasn't caught up yet.
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  const [hiddenInvites, setHiddenInvites] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function settle(callId: string) {
    setSettled((prev) => new Set(prev).add(callId));
  }
  // Stable, because each invitation's toast restarts its timer when this changes.
  const hideInvitation = useCallback((callId: string) => {
    setHiddenInvites((prev) => new Set(prev).add(callId));
  }, []);

  function handleEnd(callId: string, reason: CallEndReason) {
    if (reason === "dropped") {
      setDropped(callId);
      return;
    }
    settle(callId);
    setNotice(reason === "removed" ? LEFT_THE_CALL : CALL_ENDED);
  }

  const { link, state } = useCallLink(handleEnd);
  const connected = state.status === "connected" || state.status === "reconnecting";
  const poll = useCallsPoll(signedIn, connected);
  const { muted, toggle: toggleMuted } = useMutedMembers(link);

  const serverCall = poll.data?.call ?? null;
  const enabled = signedIn && poll.data?.voice_enabled === true;

  // The server stopped counting this member while the audio is still up: a
  // removal LiveKit didn't deliver, or a heartbeat that went stale. Only an
  // answer asked for after connecting counts, so one already in flight when
  // the member joined can't hang them up.
  useEffect(() => {
    if (!connected || !state.callId || poll.askedAt <= state.joinedAt) return;
    if (serverCall?.id !== state.callId) link.endBecause("removed");
  }, [connected, state.callId, state.joinedAt, serverCall, poll.askedAt, link]);

  /** Join from a tap. "refused" means our server said no (the call ended, a
   * full call, Ghost Mode), so there's nothing to retry. */
  async function connect(
    getTicket: () => Promise<CallTicket>,
  ): Promise<"joined" | "refused" | "failed"> {
    if (user?.ghost) {
      setNotice(GHOST_NO_CALLS);
      return "refused";
    }
    setNotice("");
    setBusy(true);
    const seat = { callId: "" };
    try {
      await link.join(async () => {
        const ticket = await getTicket();
        seat.callId = ticket.callId;
        return ticket;
      });
      setDropped(null);
      return "joined";
    } catch (err) {
      if (err instanceof CallJoinError && err.micDenied) {
        setNotice(MIC_DENIED);
        // The token route already counted this member in. Say they left, so
        // nobody sees them in a call they can't hear; if that fails too, the
        // missing heartbeat drops them within 45 seconds anyway.
        if (seat.callId) void postTo(seat.callId, "leave").catch(() => undefined);
        return "failed";
      }
      setNotice(userMessage(err, "Couldn't join the call."));
      return err instanceof ApiError && !seat.callId ? "refused" : "failed";
    } finally {
      setBusy(false);
      poll.refresh();
    }
  }

  /** Leave the call this link is in before joining another: the server
   * allows one call at a time. */
  async function leaveCurrentFirst(target: string) {
    const current = state.callId;
    if (!current || current === target) return;
    settle(current);
    await postTo(current, "leave");
  }

  const value: CallContextValue = {
    enabled,
    ghost: !!user?.ghost,
    call: serverCall,
    invitations: (poll.data?.invitations ?? []).filter(
      (i) => !hiddenInvites.has(i.call_id) && i.call_id !== state.callId,
    ),
    link: state,
    rejoinCallId:
      state.status === "idle" && !busy
        ? (dropped ?? (serverCall && !settled.has(serverCall.id) ? serverCall.id : null))
        : null,
    notice:
      notice || (poll.unreachable ? "Can't reach Our Place right now. Your call may drop." : ""),
    unreachable: poll.unreachable,
    busy,
    muted,
    async start(usernames) {
      const outcome = await connect(async () => {
        const { call_id } = await apiFetch<{ call_id: string }>("/api/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernames }),
        });
        return tokenFor(call_id);
      });
      return outcome === "joined";
    },
    join(callId) {
      hideInvitation(callId);
      void connect(async () => {
        await leaveCurrentFirst(callId);
        return tokenFor(callId);
      });
    },
    rejoin() {
      const callId = dropped ?? serverCall?.id;
      if (!callId) return;
      void connect(() => tokenFor(callId)).then((outcome) => {
        if (outcome !== "refused") return;
        settle(callId);
        setDropped(null);
      });
    },
    decline(callId) {
      hideInvitation(callId);
      settle(callId);
      postTo(callId, "decline")
        .catch((err) => setNotice(userMessage(err, "Couldn't decline the call.")))
        .finally(poll.refresh);
    },
    hideInvitation,
    leave() {
      const callId = state.callId ?? dropped ?? serverCall?.id;
      setDropped(null);
      if (!callId) return;
      settle(callId);
      void link.leave();
      postTo(callId, "leave")
        .catch((err) => setNotice(userMessage(err, "Couldn't leave the call.")))
        .finally(poll.refresh);
    },
    async invite(usernames) {
      const callId = state.callId;
      if (!callId) return false;
      try {
        await apiFetch(`/api/calls/${encodeURIComponent(callId)}/invites`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernames }),
        });
        return true;
      } catch (err) {
        setNotice(userMessage(err, "Couldn't invite them."));
        return false;
      } finally {
        poll.refresh();
      }
    },
    toggleMic() {
      link
        .setMic(!state.micOn)
        .catch((err) => setNotice(userMessage(err, "Couldn't change your microphone.")));
    },
    toggleMuted,
    startAudio() {
      link.startAudio().catch((err) => setNotice(userMessage(err, "Couldn't play the call.")));
    },
    dismissRejoin() {
      const callId = dropped ?? serverCall?.id;
      setDropped(null);
      if (!callId) return;
      // Not rejoining is leaving: tell the server now rather than letting the
      // heartbeat lapse, so the others' list is right straight away.
      settle(callId);
      postTo(callId, "leave")
        .catch((err) => setNotice(userMessage(err, "Couldn't leave the call.")))
        .finally(poll.refresh);
    },
    dismissNotice: () => setNotice(""),
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
