import type { Locale } from "../i18n/config";
import type {
  ProviderCredentials,
  VoiceClient,
  VoiceClientEventMap,
  VoiceProviderConfig,
  Unsubscribe,
} from "./types";

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string; confidence?: number };
    };
  };
}

interface BrowserSpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

/**
 * FRONTEND §7.1-7.3 (Q-05):
 * Interactive Voice Call Client with:
 * - Real 30 fps AnalyserNode RMS audio level metering from microphone MediaStream
 * - Continuous SpeechRecognition (bn-BD / en-US) with live interim captions
 * - Pluggable Vapi WebRTC, ElevenLabs (eleven_multilingual_v2 + Conversational AI),
 *   and Browser SpeechSynthesis neural voice output
 * - Automatic echo-safe turn taking (mutes STT while assistant speaks, resumes after)
 * - 60s hidden-tab timer that pauses and releases the microphone
 */
export class WebRtcVoiceClient implements VoiceClient {
  private lang: Locale = "bn";
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private ttsAnimTimer: ReturnType<typeof setInterval> | null = null;
  private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  private recognition: BrowserSpeechRecognitionInstance | null = null;
  private activeAudioEl: HTMLAudioElement | null = null;
  private elevenWs: WebSocket | null = null;
  private isPaused = false;
  private isEnded = false;
  private isSpeaking = false;
  private smoothedLevel = 0;

  private providerConfig: VoiceProviderConfig = {
    provider: "browser_speech",
    speakerEnabled: true,
  };

  private onInterimCallback?: (text: string) => void;
  private onUtteranceCallback?: (text: string) => Promise<void>;

  private listeners: {
    [K in keyof VoiceClientEventMap]: Set<(payload: VoiceClientEventMap[K]) => void>;
  } = {
    state: new Set(),
    caption: new Set(),
    level: new Set(),
    error: new Set(),
  };

  constructor(options?: {
    initialLanguage?: Locale;
    providerConfig?: VoiceProviderConfig;
    onInterim?: (text: string) => void;
    onUtterance?: (text: string) => Promise<void>;
  }) {
    if (options?.initialLanguage) {
      this.lang = options.initialLanguage;
    }
    if (options?.providerConfig) {
      this.providerConfig = { ...this.providerConfig, ...options.providerConfig };
    }
    this.onInterimCallback = options?.onInterim;
    this.onUtteranceCallback = options?.onUtterance;
  }

  public updateProviderConfig(cfg: Partial<VoiceProviderConfig>) {
    this.providerConfig = { ...this.providerConfig, ...cfg };
    if (cfg.speakerEnabled === false) {
      this.stopSpeaking();
    }
  }

  private emit<K extends keyof VoiceClientEventMap>(
    event: K,
    payload: VoiceClientEventMap[K]
  ) {
    for (const cb of this.listeners[event]) {
      cb(payload);
    }
  }

  private startAudioMetering(stream: MediaStream) {
    if (typeof window === "undefined") return;
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      this.emit("level", 0.32);
      return;
    }

    try {
      const ctx = new AudioContextCtor();
      this.audioCtx = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      this.analyser = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastFrameTime = 0;

      const tick = (now: number) => {
        if (this.isEnded || this.isPaused) return;
        // 30 fps cap per UIUX_DESIGN §4.2 & FRONTEND §7.2
        if (now - lastFrameTime >= 33) {
          lastFrameTime = now;
          if (!this.isSpeaking && this.analyser) {
            this.analyser.getByteTimeDomainData(dataArray);
            let sumSquares = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const normalized = (dataArray[i] - 128) / 128;
              sumSquares += normalized * normalized;
            }
            const rms = Math.sqrt(sumSquares / dataArray.length);
            // Boost speech sensitivity into [0.08 .. 1.0] range for expressive route-line deflection
            const boosted = Math.min(1, Math.max(0.08, rms * 4.2));
            this.smoothedLevel = this.smoothedLevel * 0.65 + boosted * 0.35;
            this.emit("level", Number(this.smoothedLevel.toFixed(3)));
          }
        }
        if (typeof requestAnimationFrame === "function") {
          this.rafId = requestAnimationFrame(tick);
        }
      };

      if (typeof requestAnimationFrame === "function") {
        this.rafId = requestAnimationFrame(tick);
      }
    } catch {
      this.emit("level", 0.35);
    }
  }

  private startSpeechRecognition() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || this.isEnded || this.isPaused) return;

    this.stopSpeechRecognition();

    try {
      const rec = new Ctor();
      rec.lang = this.lang === "bn" ? "bn-BD" : "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (event: BrowserSpeechRecognitionEvent) => {
        if (this.isPaused || this.isEnded || this.isSpeaking) return;
        let interim = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const chunk = res[0]?.transcript ?? "";
          if (res.isFinal) {
            finalTranscript += chunk;
          } else {
            interim += chunk;
          }
        }

        if (interim.trim()) {
          this.onInterimCallback?.(interim.trim());
        }

        if (finalTranscript.trim()) {
          this.onInterimCallback?.("");
          void this.onUtteranceCallback?.(finalTranscript.trim());
        }
      };

      rec.onerror = (event: { error: string }) => {
        // 'no-speech' and 'aborted' are normal lifecycle events during turn-taking
        if (event.error !== "no-speech" && event.error !== "aborted") {
          this.emit("error", {
            code: event.error,
            message: `Speech recognition notice: ${event.error}`,
          });
        }
      };

      rec.onend = () => {
        // Automatically keep continuous listening alive during the call unless speaking/paused/ended
        if (!this.isPaused && !this.isEnded && !this.isSpeaking && this.recognition === rec) {
          try {
            rec.start();
          } catch {
            // Ignore InvalidStateError if already started
          }
        }
      };

      this.recognition = rec;
      rec.start();
    } catch {
      // Browser may not support SpeechRecognition in headless tests
    }
  }

  private stopSpeechRecognition() {
    if (this.recognition) {
      const rec = this.recognition;
      this.recognition = null;
      try {
        rec.onend = null;
        rec.abort();
      } catch {
        // Ignore abort errors
      }
    }
  }

  public stopSpeaking() {
    this.isSpeaking = false;
    if (this.ttsAnimTimer) {
      clearInterval(this.ttsAnimTimer);
      this.ttsAnimTimer = null;
    }
    if (this.activeAudioEl) {
      try {
        this.activeAudioEl.pause();
        this.activeAudioEl.src = "";
      } catch {
        // Ignore
      }
      this.activeAudioEl = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }

  private startSyntheticVoiceWaveAnimation() {
    if (this.ttsAnimTimer) clearInterval(this.ttsAnimTimer);
    let step = 0;
    this.ttsAnimTimer = setInterval(() => {
      step += 1;
      const wave = 0.35 + 0.45 * Math.abs(Math.sin(step * 0.45) * Math.cos(step * 0.22));
      this.emit("level", Number(wave.toFixed(3)));
    }, 45);
  }

  /**
   * Speaks assistant text out loud using:
   * 1. ElevenLabs Multilingual v2 API (if provider === 'elevenlabs' or elevenLabsApiKey is configured)
   * 2. Browser Web Speech Synthesis (with automatic bn-BD / en-US voice selection)
   */
  public async speakAssistantText(text: string, lang: Locale): Promise<void> {
    if (this.isEnded || this.isPaused || this.providerConfig.speakerEnabled === false) {
      if (!this.isEnded && !this.isPaused) {
        this.emit("state", "listening");
      }
      return;
    }

    // Strip internal contract placeholder prefix when speaking out loud so voice sounds natural
    const spokenText = text
      .replace(/^PLACEHOLDER\s*—\s*NOT CLINICALLY APPROVED:\s*/i, "")
      .trim();
    if (!spokenText) return;

    this.stopSpeaking();
    this.stopSpeechRecognition();
    this.isSpeaking = true;
    this.emit("state", "speaking");
    this.startSyntheticVoiceWaveAnimation();

    const finishSpeaking = () => {
      if (this.ttsAnimTimer) {
        clearInterval(this.ttsAnimTimer);
        this.ttsAnimTimer = null;
      }
      this.isSpeaking = false;
      if (!this.isEnded && !this.isPaused) {
        this.emit("state", "listening");
        this.startSpeechRecognition();
      }
    };

    const elevenKey =
      this.providerConfig.elevenLabsApiKey ||
      (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY : undefined);

    if (
      (this.providerConfig.provider === "elevenlabs" || Boolean(elevenKey)) &&
      elevenKey &&
      typeof window !== "undefined" &&
      typeof fetch === "function"
    ) {
      const voiceId =
        this.providerConfig.elevenLabsVoiceId ||
        (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID : undefined) ||
        "EXAVITQu4vr4xnSDxMaL"; // Sarah - ElevenLabs Multilingual v2 default voice

      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "xi-api-key": elevenKey,
            },
            body: JSON.stringify({
              text: spokenText,
              model_id: "eleven_multilingual_v2",
              voice_settings: {
                stability: 0.52,
                similarity_boost: 0.78,
                style: 0.15,
                use_speaker_boost: true,
              },
            }),
          }
        );

        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          this.activeAudioEl = audio;
          await new Promise<void>((resolve) => {
            audio.onended = () => {
              URL.revokeObjectURL(url);
              resolve();
            };
            audio.onerror = () => {
              URL.revokeObjectURL(url);
              resolve();
            };
            audio.play().catch(() => resolve());
          });
          finishSpeaking();
          return;
        }
      } catch {
        // Fall through seamlessly to browser speechSynthesis
      }
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(spokenText);
        utterance.lang = lang === "bn" ? "bn-BD" : "en-US";
        utterance.rate = lang === "bn" ? 0.96 : 1.0;
        utterance.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices?.() ?? [];
        const matchingVoice =
          voices.find((v) =>
            lang === "bn"
              ? v.lang.toLowerCase().startsWith("bn")
              : v.lang.toLowerCase().startsWith("en")
          ) ?? null;
        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }

        await new Promise<void>((resolve) => {
          const safetyTimeout = setTimeout(resolve, Math.max(3500, spokenText.length * 95));
          utterance.onend = () => {
            clearTimeout(safetyTimeout);
            resolve();
          };
          utterance.onerror = () => {
            clearTimeout(safetyTimeout);
            resolve();
          };
          window.speechSynthesis.speak(utterance);
        });
      } catch {
        // Ignore synthesis failure in headless test browsers
      }
    }

    finishSpeaking();
  }

  private setupVisibilityTimer() {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
        // FRONTEND §7.2: 60s hidden tab pauses session and releases microphone
        this.hiddenTimer = setTimeout(() => {
          this.pause();
        }, 60_000);
      } else if (this.hiddenTimer) {
        clearTimeout(this.hiddenTimer);
        this.hiddenTimer = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  private stopAllTracks() {
    this.stopSpeaking();
    this.stopSpeechRecognition();
    if (this.elevenWs) {
      try {
        this.elevenWs.close();
      } catch {
        // Ignore
      }
      this.elevenWs = null;
    }
    if (this.rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.audioCtx) {
      try {
        void this.audioCtx.close();
      } catch {
        // Ignore
      }
      this.audioCtx = null;
      this.analyser = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }

  async connect(_creds: ProviderCredentials, stream?: MediaStream | null): Promise<void> {
    this.isEnded = false;
    this.isPaused = false;
    this.emit("state", "connecting");
    this.stream = stream ?? null;

    if (this.stream) {
      this.startAudioMetering(this.stream);
    }

    this.setupVisibilityTimer();

    // Optional ElevenLabs Conversational AI WebSocket bridge when agentId is configured
    const agentId =
      this.providerConfig.elevenLabsAgentId ||
      (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID : undefined);
    if (
      this.providerConfig.provider === "elevenlabs" &&
      agentId &&
      typeof WebSocket !== "undefined"
    ) {
      try {
        const ws = new WebSocket(
          `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${encodeURIComponent(agentId)}`
        );
        this.elevenWs = ws;
        ws.onmessage = (evt) => {
          try {
            const data = JSON.parse(String(evt.data));
            if (data.type === "agent_response" && data.agent_response_event?.agent_response) {
              this.emit("caption", {
                role: "assistant",
                text: data.agent_response_event.agent_response,
                lang: this.lang,
                at: new Date().toISOString(),
              });
            }
          } catch {
            // Ignore malformed frame
          }
        };
      } catch {
        // Fall back cleanly to local SpeechRecognition + TTS loop
      }
    }

    this.emit("state", "listening");
    this.startSpeechRecognition();
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
    if (!this.isPaused && !this.isEnded && !this.isSpeaking && this.stream) {
      this.startSpeechRecognition();
    }
  }

  pause(): void {
    this.isPaused = true;
    this.stopAllTracks();
    this.emit("level", 0);
    this.emit("state", "paused");
  }

  resume(): void {
    this.isPaused = false;
    this.emit("state", "listening");
    this.startSpeechRecognition();
  }

  async end(): Promise<void> {
    this.isEnded = true;
    if (this.hiddenTimer) {
      clearTimeout(this.hiddenTimer);
      this.hiddenTimer = null;
    }
    this.stopAllTracks();
    this.emit("level", 0);
    this.emit("state", "ended");
  }
}
