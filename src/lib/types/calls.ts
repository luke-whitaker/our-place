// Voice call wire types, as /api/calls returns them.

/** The most people in one call, counting everyone joined and invited. */
export const MAX_CALL_SIZE = 8;

export type CallMemberStatus = "joined" | "pending";

export interface CallMember {
  username: string;
  display_name: string;
  avatar_color: string;
  /** "joined" is in the call now; "pending" was invited and hasn't answered. */
  status: CallMemberStatus;
}

/** The call the viewer is in. */
export interface CurrentCall {
  id: string;
  started_at: string;
  /** Everyone joined or still invited, the viewer included, joined first. */
  members: CallMember[];
}

/** An invitation the viewer hasn't answered yet, from a call still going. */
export interface CallInvitation {
  call_id: string;
  /** Who invited the viewer. Null if that member has since deleted their account. */
  invited_by: { username: string; display_name: string } | null;
  /** Who's in the call now, the inviter included. */
  joined: { username: string; display_name: string }[];
  /** When the invitation stops working if it isn't answered. */
  expires_at: string;
}

/** GET /api/calls/current: what the client polls every ~10 seconds. */
export interface CallsCurrentResponse {
  /** False when this server has no LiveKit keys; the client hides voice. */
  voice_enabled: boolean;
  call: CurrentCall | null;
  invitations: CallInvitation[];
}

/** POST /api/calls/[id]/token: everything the client needs to connect. */
export interface CallTokenResponse {
  message: string;
  call_id: string;
  /** The LiveKit server address (wss://). */
  url: string;
  token: string;
  /** Ask for a new token before this, while still in the call. */
  expires_at: string;
}
