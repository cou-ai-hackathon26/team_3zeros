import type { Locale } from "../i18n/config";
import type {
  ProviderCredentials,
  VoiceClient,
  VoiceClientEventMap,
  VoiceSessionState,
  Unsubscribe,
} from "./types";

export interface TurnResponsePayload {
  state: string;
  assistantText: string;
  isEmergency?: boolean;
}

export interface TextClientOptions {
  sessionId: string;
  initialLanguage?: Locale;
  sendTurn: (text: string, lang: Locale) => Promise<TurnResponsePayload>;
}

/**
 * FRONTEND §8.2 & Review Focus #4:
 * TextClient implements the exact VoiceClient interface over POST /triage/sessions/{id}/turns
 * so the UI has one code path. Immediately stops active MediaStreamTracks and enters
 * "emergency" state when EMERGENCY_PATHWAY is triggered.
 */
export class TextClient implements VoiceClient {
  private readonly opts: TextClientOptions;
  private lang: Locale;
  private stream: MediaStream | null = null;
  private listeners: {
    [K in keyof VoiceClientEventMap]: Set<(payload: VoiceClientEventMap[K]) => void>;
  } = {
    state: new Set(),
    caption: new Set(),
    level: new Set(),
    error: new Set(),
  };

  constructor(opts: TextClientOptions) {
    this.opts = opts;
    this.lang = opts.initialLanguage ?? "bn";
  }

  private emit<K extends keyof VoiceClientEventMap>(
    event: K,
    payload: VoiceClientEventMap[K]
  ) {
    for (const cb of this.listeners[event]) {
      cb(payload);
    }
  }

  private stopStreamTracks() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }

  async connect(_creds: ProviderCredentials, stream?: MediaStream | null): Promise<void> {
    this.stream = stream ?? null;
    this.emit("state", "listening");
  }

  on<K extends keyof VoiceClientEventMap>(
    event: K,
    cb: (payload: VoiceClientEventMap[K]) => void
  ): Unsubscribe {
    this.listeners[event].add(cb);
    return () => {
      this.listeners[event].delete(cb);
    };
  }

  setLanguage(lang: Locale): void {
    this.lang = lang;
  }

  pause(): void {
    this.stopStreamTracks();
    this.emit("state", "paused");
  }

  resume(): void {
    this.emit("state", "listening");
  }

  async end(): Promise<void> {
    this.stopStreamTracks();
    this.emit("state", "ended");
  }

  async sendText(text: string): Promise<TurnResponsePayload> {
    this.emit("caption", {
      role: "patient",
      text,
      lang: this.lang,
      at: new Date().toISOString(),
    });
    this.emit("state", "thinking");

    const reply = await this.opts.sendTurn(text, this.lang);
    if (reply.isEmergency || reply.state === "EMERGENCY_PATHWAY") {
      this.stopStreamTracks();
      this.emit("state", "emergency");
      return reply;
    }

    this.emit("caption", {
      role: "assistant",
      text: reply.assistantText,
      lang: this.lang,
      at: new Date().toISOString(),
    });
    this.emit("state", "listening");
    return reply;
  }
}
