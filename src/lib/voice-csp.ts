// The Content-Security-Policy sources voice calls need, kept apart from
// src/proxy.ts so they can be tested without a request.

/** Where voice calls connect: the LiveKit server in LIVEKIT_URL, over both
 * wss:// (the signal connection) and https:// (the client's region lookup).
 * On LiveKit Cloud the client may fail over to another region's host under
 * the same domain, so a *.livekit.cloud project allows that domain's
 * subdomains too, and nothing wider. The audio itself travels over WebRTC,
 * which connect-src doesn't govern. Empty when voice isn't configured. */
export function voiceConnectSources(liveKitUrl: string | undefined): string[] {
  if (!liveKitUrl) return [];
  let host: string;
  try {
    host = new URL(liveKitUrl).host;
  } catch {
    return [];
  }
  const sources = [`wss://${host}`, `https://${host}`];
  if (host.endsWith(".livekit.cloud")) {
    sources.push("wss://*.livekit.cloud", "https://*.livekit.cloud");
  }
  return sources;
}
