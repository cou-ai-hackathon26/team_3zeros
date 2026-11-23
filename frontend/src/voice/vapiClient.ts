import type { Locale } from "../i18n/config";
import type {
  ProviderCredentials,
  Unsubscribe,
  VoiceClient,
  VoiceClientEventMap,
} from "./types";

/**
 * Vapi web call adapter (MASTERPLAN D-22, Q-05, SECURITY §8.1).
 *
 * Only the random `sessionRef` is attached to the call as metadata so the
 * backend webhook can match transcripts to the triage session. No name, phone
 * or record ID, and no system prompt, is ever sent from the browser (D-08).
 * The SDK is loaded lazily so it stays out of the first-load bundle.
 */
type VapiLike = {
  start(assistantId: string, overrides?: Record<string, unknown>): Promise<unknown>;
  stop(): void | Promise<void>;
  setMuted(muted: boolean): void;
  on(event: string, cb: (...args: never[]) => void): void;
  removeAllListeners?(): void;
};

type VapiMessage = { type?: string; role?: string; transcriptType?: string; transcript?: string };

export class VapiVoiceClient implements VoiceClient {
  private vapi: VapiLike | null = null;
  private lang: Locale;
  private ended = false;
  private listeners: {
    [K in keyof VoiceClientEventMap]: Set<(payload: VoiceClientEventMap[K]) => void>;
  } = { state: new Set(), caption: new Set(), level: new Set(), error: new Set() };

  constructor(
    initialLanguage: Locale = "bn",
    private readonly loadSdk: () => Promise<{ default: new (key: string) => VapiLike }> = () =>
      import("@vapi-ai/web") as unknown as Promise<{ default: new (key: string) => VapiLike }>,
  ) {
    this.lang = initialLanguage;
  }

  private emit<K extends keyof VoiceClientEventMap>(event: K, payload: VoiceClientEventMap[K]) {
    for (const cb of this.listeners[event]) cb(payload);
  }

  on<K extends keyof VoiceClientEventMap>(event: K, cb: (payload: VoiceClientEventMap[K]) => void): Unsubscribe {
    this.listeners[event].add(cb);
    return () => {
      this.listeners[event].delete(cb);
    };
  }

  async connect(creds: ProviderCredentials, stream?: MediaStream | null): Promise<void> {
    // Vapi opens its own microphone; release the permission-probe stream first.
    if (stream) for (const track of stream.getTracks()) track.stop();
    this.ended = false;
    this.emit("state", "ringing");
    try {
      const assistantId = creds.assistantId;
      if (!assistantId) throw new Error("missing_assistant");
      const { default: Vapi } = await this.loadSdk();
      const vapi = new Vapi(creds.token);
      this.vapi = vapi;
      vapi.on("call-start", () => {
        this.emit("state", "connected");
        setTimeout(() => !this.ended && this.emit("state", "listening"), 600);
      });
      vapi.on("speech-start", () => this.emit("state", "speaking"));
      vapi.on("speech-end", () => this.emit("state", "listening"));
      vapi.on("volume-level", ((level: number) => this.emit("level", Math.max(0, Math.min(1, level)))) as never);
      vapi.on("message", ((m: VapiMessage) => {
        if (m?.type?.startsWith("transcript") && m.transcriptType !== "partial" && m.transcript) {
          this.emit("caption", {
            role: m.role === "user" ? "patient" : "assistant",
            text: m.transcript,
            lang: this.lang,
            at: new Date().toISOString(),
          });
        }
      }) as never);
      vapi.on("call-end", () => {
        this.emit("level", 0);
        this.emit("state", "ended");
      });
      vapi.on("error", (() => {
        this.emit("error", { code: "call_error", message: "The call was interrupted." });
        this.emit("state", "connection_lost");
      }) as never);
      await vapi.start(assistantId, { metadata: { session_ref: creds.sessionRef } });
    } catch {
      this.emit("error", { code: "call_start_failed", message: "Could not start the call." });
      this.emit("state", "connection_lost");
    }
  }

  setLanguage(lang: Locale): void {
    this.lang = lang;
  }

  setMuted(muted: boolean): void {
    this.vapi?.setMuted(muted);
  }

  pause(): void {
    this.vapi?.setMuted(true);
    this.emit("state", "paused");
  }

  resume(): void {
    this.vapi?.setMuted(false);
    this.emit("state", "listening");
  }

  /** Stops audio at once (required on emergency, INV-16). */
  async end(): Promise<void> {
    this.ended = true;
    try {
      await this.vapi?.stop();
    } catch {
      // already closed
    }
    this.vapi = null;
    this.emit("level", 0);
    this.emit("state", "ended");
  }
}
