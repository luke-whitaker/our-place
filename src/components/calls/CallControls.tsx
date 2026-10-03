"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import CallFriendPicker from "@/components/calls/CallFriendPicker";
import { useCalls } from "@/components/calls/CallProvider";
import LiveIndicator from "@/components/calls/LiveIndicator";
import { orderMembers, roomLeft } from "@/lib/call-display";
import type { CallMember } from "@/lib/types";

const buttonClass =
  "rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-emphasis disabled:opacity-50";

function MemberRow({ member, self }: { member: CallMember; self: boolean }) {
  const calls = useCalls();
  const speaking = calls.link.speaking.has(member.user_id);
  const muted = calls.muted.has(member.user_id);
  const joined = member.status === "joined";

  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-ink-inverse ${
            speaking ? "ring-2 ring-green-500 ring-offset-2 ring-offset-surface" : ""
          } ${joined ? "" : "opacity-50"}`}
          style={{ backgroundColor: member.avatar_color || "#6366f1" }}
        >
          {member.display_name.charAt(0).toUpperCase()}
        </span>
        <span className="truncate text-sm text-ink">
          {member.display_name}
          {self && <span className="text-ink-faint"> (you)</span>}
        </span>
        {speaking && <span className="sr-only">is talking</span>}
        {!joined && <span className="shrink-0 text-xs text-ink-faint">Invited</span>}
      </div>
      {!self && joined && (
        <button
          type="button"
          aria-pressed={muted}
          onClick={() => calls.toggleMuted(member.user_id)}
          title={muted ? "Only you can't hear them" : "Mute them for you only"}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-emphasis"
        >
          {muted ? "Unmute" : "Mute"}
        </button>
      )}
    </li>
  );
}

/**
 * Everything a member can do in a call: who's there (with who's talking),
 * muting someone for yourself, your own microphone, inviting your friends,
 * and leaving. Used in the navbar's call menu and the world's call sheet.
 */
export default function CallControls() {
  const calls = useCalls();
  const { user } = useAuth();
  const [inviting, setInviting] = useState(false);
  const { link, call } = calls;
  const me = user?.username ?? "";
  const members = call && call.id === link.callId ? orderMembers(call.members, me) : [];
  const room = roomLeft(members);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {link.status === "connecting"
            ? "Joining the call…"
            : link.status === "reconnecting"
              ? "Reconnecting…"
              : "In a call"}
        </p>
        <LiveIndicator micOn={link.micOn} />
      </div>

      {link.audioBlocked && (
        <button
          type="button"
          onClick={calls.startAudio}
          className="w-full rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-ink-inverse"
        >
          Tap to hear the call
        </button>
      )}

      {members.length > 0 && (
        <ul aria-label="In this call" className="divide-y divide-line-soft">
          {members.map((m) => (
            <MemberRow key={m.username} member={m} self={m.username === me} />
          ))}
        </ul>
      )}

      {inviting ? (
        <CallFriendPicker
          max={room}
          exclude={new Set(members.map((m) => m.username))}
          submitLabel="Invite"
          busy={calls.busy}
          onSubmit={(usernames) => {
            void calls.invite(usernames).then((ok) => {
              if (ok) setInviting(false);
            });
          }}
          onCancel={() => setInviting(false)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={calls.toggleMic} className={buttonClass}>
            {link.micOn ? "Mute me" : "Unmute me"}
          </button>
          <button
            type="button"
            onClick={() => setInviting(true)}
            disabled={room === 0 || link.status !== "connected"}
            title={room === 0 ? "A call holds 8 people, counting invitations." : undefined}
            className={buttonClass}
          >
            Invite
          </button>
          <button
            type="button"
            onClick={calls.leave}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Leave
          </button>
        </div>
      )}
    </div>
  );
}
