import { describe, expect, it, vi } from "vitest";
import { VapiVoiceClient, captionLanguage } from "./vapiClient";
import type { VoiceSessionState } from "./types";

function fakeSdk() {
  const handlers: Record<string, (...a: unknown[]) => void> = {};
  const vapi = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    setMuted: vi.fn(),
    on: (e: string, cb: (...a: unknown[]) => void) => {
      handlers[e] = cb;
    },
  };
  const Ctor = vi.fn(() => vapi);
  return { handlers, vapi, Ctor, load: () => Promise.resolve({ default: Ctor as never }) };
}

const creds = { sessionRef: "ref-1", token: "pk", assistantId: "asst-1" };

describe("VapiVoiceClient", () => {
  it("goes ringing → connected → listening → speaking, like a phone call", async () => {
    vi.useFakeTimers();
    const sdk = fakeSdk();
    const client = new VapiVoiceClient("en", sdk.load);
    const states: VoiceSessionState[] = [];
    client.on("state", (s) => states.push(s));
    await client.connect(creds, null);
    sdk.handlers["call-start"]();
    vi.advanceTimersByTime(700);
    sdk.handlers["speech-start"]();
    sdk.handlers["speech-end"]();
    expect(states).toEqual(["ringing", "connected", "listening", "speaking", "listening"]);
    vi.useRealTimers();
  });

  it("sends only the session_ref to Vapi and the public key to the SDK", async () => {
    const sdk = fakeSdk();
    await new VapiVoiceClient("bn", sdk.load).connect(creds, null);
    expect(sdk.Ctor).toHaveBeenCalledWith("pk");
    expect(sdk.vapi.start).toHaveBeenCalledWith("asst-1", { metadata: { session_ref: "ref-1" } });
  });

  it("emits final transcripts as captions and ignores partials", async () => {
    const sdk = fakeSdk();
    const client = new VapiVoiceClient("bn", sdk.load);
    const captions: string[] = [];
    client.on("caption", (c) => captions.push(`${c.role}:${c.lang}:${c.text}`));
    await client.connect(creds, null);
    sdk.handlers["message"]({ type: "transcript", role: "assistant", transcriptType: "partial", transcript: "আপ" });
    sdk.handlers["message"]({ type: "transcript", role: "assistant", transcriptType: "final", transcript: "আপনার সমস্যা কী?" });
    sdk.handlers["message"]({ type: "transcript", role: "user", transcriptType: "final", transcript: "জ্বর" });
    expect(captions).toEqual(["assistant:bn:আপনার সমস্যা কী?", "patient:bn:জ্বর"]);
  });

  it("labels each caption by its own script, not by the page language", async () => {
    expect(captionLanguage("How old are you?")).toBe("en");
    expect(captionLanguage("আপনার বয়স কত?")).toBe("bn");
    expect(captionLanguage("Hello, আমাদের স্বাস্থ্যসেবা সহায়ক প্ল্যাটফর্মে আপনাকে স্বাগতম।")).toBe("bn");
    const sdk = fakeSdk();
    const client = new VapiVoiceClient("en", sdk.load); // page in English, agent speaks Bangla
    const langs: string[] = [];
    client.on("caption", (c) => langs.push(c.lang));
    await client.connect(creds, null);
    sdk.handlers["message"]({ type: "transcript", role: "assistant", transcriptType: "final", transcript: "আপনার সমস্যা কী?" });
    expect(langs).toEqual(["bn"]);
  });

  it("reports connection_lost when the SDK errors or start fails, and stops tracks of the probe stream", async () => {
    const sdk = fakeSdk();
    sdk.vapi.start.mockRejectedValueOnce(new Error("x"));
    const track = { stop: vi.fn() };
    const client = new VapiVoiceClient("en", sdk.load);
    const states: VoiceSessionState[] = [];
    client.on("state", (s) => states.push(s));
    await client.connect(creds, { getTracks: () => [track] } as unknown as MediaStream);
    expect(track.stop).toHaveBeenCalled();
    expect(states).toContain("connection_lost");
  });

  it("end() stops the call at once and mute is forwarded", async () => {
    const sdk = fakeSdk();
    const client = new VapiVoiceClient("en", sdk.load);
    await client.connect(creds, null);
    client.setMuted(true);
    await client.end();
    expect(sdk.vapi.setMuted).toHaveBeenCalledWith(true);
    expect(sdk.vapi.stop).toHaveBeenCalled();
  });
});
