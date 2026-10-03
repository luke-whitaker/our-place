// The one place that talks to LiveKit, the service that carries call audio.
// Everything else asks this module, so tests mock one import and the rest of
// the code never sees the SDK. Nothing here ever starts a recording, and
// livekit.test.ts checks that no file in src touches LiveKit's recording API.
//
// Configure with:
//   LIVEKIT_URL         the project's wss:// address, which clients connect to
//   LIVEKIT_API_KEY     from the LiveKit Cloud project's settings
//   LIVEKIT_API_SECRET  the matching secret; it stays on the server
//
// Without them, voice is simply off: voiceConfigured() is false and the token
// route answers 503. Nothing reads them at import time, because `next build`
// evaluates module-level code without them.

import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";

/** How long a call token is valid. The client asks for a fresh one before
 * this runs out, for as long as it stays in the call. */
export const CALL_TOKEN_TTL_SECONDS = 10 * 60;

interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

function config(): LiveKitConfig | null {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

function requireConfig(): LiveKitConfig {
  const c = config();
  if (!c)
    throw new Error(
      "LiveKit is not configured (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).",
    );
  return c;
}

/** Whether this server can hand out call tokens at all. */
export function voiceConfigured(): boolean {
  return config() !== null;
}

/** The address clients connect to with their token. */
export function voiceUrl(): string {
  return requireConfig().url;
}

/** A token that lets one member into one call's room: audio from their
 * microphone only, no data messages, no video, for CALL_TOKEN_TTL_SECONDS. */
export async function mintCallToken(params: {
  callId: string;
  userId: string;
  displayName: string;
}): Promise<string> {
  const { apiKey, apiSecret } = requireConfig();
  const token = new AccessToken(apiKey, apiSecret, {
    identity: params.userId,
    name: params.displayName,
    ttl: CALL_TOKEN_TTL_SECONDS,
  });
  token.addGrant({
    room: params.callId,
    roomJoin: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: false,
  });
  return token.toJwt();
}

function roomService(): RoomServiceClient {
  const { url, apiKey, apiSecret } = requireConfig();
  // The server API speaks HTTPS at the same host the clients reach over wss.
  return new RoomServiceClient(url.replace(/^ws(s?):\/\//, "http$1://"), apiKey, apiSecret);
}

/** Disconnect one member from a call's room. Throws if LiveKit refuses. */
export async function removeFromRoom(callId: string, userId: string): Promise<void> {
  await roomService().removeParticipant(callId, userId);
}

/** Close a call's room, disconnecting anyone still in it. */
export async function closeRoom(callId: string): Promise<void> {
  await roomService().deleteRoom(callId);
}
