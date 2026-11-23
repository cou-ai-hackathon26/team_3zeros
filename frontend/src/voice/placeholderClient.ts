import type { Locale } from "../i18n/config";
import type {
  ProviderCredentials,
  Unsubscribe,
  VoiceClient,
  VoiceClientEventMap,
} from "./types";

/**
 * Placeholder VoiceClient adapter for Vapi integration (FRONTEND §8.2, Q-05).
 *
 * Teammate integration guide (replacing this placeholder with Vapi):
 *  1. Create `src/voice/vapiClient.ts` implementing `VoiceClient`.
 *  2. In `connect(creds, stream)`, initialize `@vapi-ai/web` using `creds.token`
 *     and `creds.sessionRef` returned by `POST /api/v1/triage/sessions/{id}/voice-credentials`.
 *     Never pass patient PII or system prompts from the browser (D-08, SECURITY §8.1).
 *  3. Emit `"caption"` for transcripts, `"state"` (`"listening"` | `"speaking"` | `"reconnecting"`),
 *     `"level"` for RMS audio level, and `"error"` on disconnect.
 *  4. In `end()`, immediately stop Vapi audio and all MediaStreamTracks (required on emergency).
 *  5. Swap `new PlaceholderVoiceClient()` in `src/voice/controller.ts` for `new VapiVoiceClient()`.
 */
export class PlaceholderVoiceClient implements VoiceClient {
  readonly isPlaceholder = true;
  private lang: Locale;
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private rafId: number | null = null;
  private lastFrameMs = 0;

  private listeners: {
    [K in keyof VoiceClientEventMap]: Set<(payload: VoiceClientEventMap[K]) => void>;
  } = {
    state: new Set(),
    caption: new Set(),
    level: new Set(),
    error: new Set(),
  };

  constructor(initialLanguage: Locale = "bn") {
    this.lang = initialLanguage;
  }

  private emit<K extends keyof VoiceClientEventMap>(
    event: K,
    payload: VoiceClientEventMap[K],
  ) {
    for (const cb of this.listeners[event]) cb(payload);
  }

  private stopAudioMeter() {
    if (this.rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
    }
    this.emit("level", 0);
  }

  private stopTracks() {
    this.stopAudioMeter();
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
  }

  private startAudioMeter(stream: MediaStream) {
    if (typeof window === "undefined" || typeof AudioContext === "undefined") return;
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this.audioCtx = ctx;

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const tick = (now: number) => {
        if (!this.audioCtx) return;
        // Cap at 30 fps and pause while document is hidden (FRONTEND §10.2)
        if (!document.hidden && now - this.lastFrameMs >= 33) {
          this.lastFrameMs = now;
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            const normalized = (buffer[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.min(1, Math.sqrt(sum / buffer.length) * 3.5);
          this.emit("level", rms);
        }
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    } catch {
      // jsdom or audio hardware unavailable: keep meter at 0
    }
  }

  async connect(creds: ProviderCredentials, stream?: MediaStream | null): Promise<void> {
    this.stream = stream ?? null;
    if (this.stream) this.startAudioMeter(this.stream);
    // TODO(teammate/vapi): Start Vapi WebRTC session using `creds.sessionRef` & `creds.token`.
    void creds;
    this.emit("state", "listening");
  }

  on<K extends keyof VoiceClientEventMap>(
    event: K,
    cb: (payload: VoiceClientEventMap[K]) => void,
  ): Unsubscribe {
    this.listeners[event].add(cb);
    return () => {
      this.listeners[event].delete(cb);
    };
  }

  setLanguage(lang: Locale): void {
    this.lang = lang;
    // TODO(teammate/vapi): Forward mid-session language switch to Vapi ASR/TTS.
  }

  getLanguage(): Locale {
    return this.lang;
  }

  pause(): void {
    this.stopTracks();
    this.emit("state", "paused");
  }

  resume(): void {
    this.emit("state", "listening");
  }

  async end(): Promise<void> {
    this.stopTracks();
    this.emit("state", "ended");
  }
}
