import type { Locale } from "../i18n/config";

export type VoiceProviderId = "vapi_placeholder" | "vapi" | "browser_speech" | "elevenlabs";

export interface VoiceProviderConfig {
  provider: VoiceProviderId;
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  elevenLabsAgentId?: string;
  vapiPublicKey?: string;
  vapiAssistantId?: string;
  speakerEnabled?: boolean;
  selectedDeviceId?: string;
}

export interface ProviderCredentials {
  sessionRef: string;
  provider?: string;
  token: string;
  expiresAt?: string;
  /** Vapi assistant to call (D-22). */
  assistantId?: string;
}

export type VoiceSessionState =
  | "permission_prompt"
  | "permission_denied"
  | "unsupported_browser"
  | "connecting"
  | "ringing"
  | "connected"
  | "listening"
  | "paused"
  | "thinking"
  | "speaking"
  | "reconnecting"
  | "connection_lost"
  | "ended"
  | "emergency";

export interface TriageCaptionEvent {
  role: "patient" | "assistant";
  text: string;
  lang: Locale;
  at: string;
  /** Machine translation of `text` into the other language (D-22). Absent when unavailable. */
  translation?: { text: string; lang: Locale; machine: true };
}

export interface TriageDraftSummary {
  sessionId: string;
  patientWords: string;
  chiefComplaint: string;
  duration: string;
  severity: string;
  additionalNotes: string;
  redFlagStatus: string;
  suggestedSpecialtyBn: string;
  suggestedSpecialtyEn: string;
  turnCount: number;
}

export type VoiceClientEventMap = {
  state: VoiceSessionState;
  caption: TriageCaptionEvent;
  level: number;
  error: { code: string; message: string };
};

export type Unsubscribe = () => void;

/**
 * FRONTEND §7.2:
 * Browser-side VoiceClient interface implemented by vendor adapters (Q-05:
 * Vapi WebRTC, ElevenLabs Conversational AI / Multilingual v2, Browser Web Speech)
 * and by TextClient over POST /api/v1/triage/sessions/{id}/turns.
 */
export interface VoiceClient {
  connect(creds: ProviderCredentials, stream?: MediaStream | null): Promise<void>;
  on<K extends keyof VoiceClientEventMap>(
    event: K,
    cb: (payload: VoiceClientEventMap[K]) => void
  ): Unsubscribe;
  setLanguage(lang: Locale): void;
  /** Mute or unmute the patient microphone during a call (optional per adapter). */
  setMuted?(muted: boolean): void;
  pause(): void;
  resume(): void;
  end(): Promise<void>;
}
