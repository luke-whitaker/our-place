import { describe, it, expect } from "vitest";
import { voiceConnectSources } from "./voice-csp";

describe("voiceConnectSources", () => {
  it("allows nothing when voice isn't configured or the address is broken", () => {
    expect(voiceConnectSources(undefined)).toEqual([]);
    expect(voiceConnectSources("")).toEqual([]);
    expect(voiceConnectSources("not a url")).toEqual([]);
  });

  it("allows a LiveKit Cloud project and its region hosts, and nothing wider", () => {
    expect(voiceConnectSources("wss://our-place-abc123.livekit.cloud")).toEqual([
      "wss://our-place-abc123.livekit.cloud",
      "https://our-place-abc123.livekit.cloud",
      "wss://*.livekit.cloud",
      "https://*.livekit.cloud",
    ]);
  });

  it("allows only the one host for a self-hosted server", () => {
    expect(voiceConnectSources("wss://voice.example.org:7880")).toEqual([
      "wss://voice.example.org:7880",
      "https://voice.example.org:7880",
    ]);
  });
});
