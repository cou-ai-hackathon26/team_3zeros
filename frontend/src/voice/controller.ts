"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ApiError, createIntentIdempotencyKey } from "../api/client";
import { useApi } from "../api/queries/provider";
import type { TriageSessionDetail, TriageTurn, TriageTurnReply, VoiceCredentialsResponse } from "../api/queries/types";
import type { Locale } from "../i18n/config";
import type {
  TriageCaptionEvent,
  VoiceClient,
  VoiceProviderConfig,
  VoiceSessionState,
} from "./types";
import { PlaceholderVoiceClient } from "./placeholderClient";

const DISCLOSURE_VERSION = "v1.0";
const TAB_SESSION_ID_KEY = "mw_active_triage_session_id"; // UUID only — zero PHI (A-14)
const TAB_HIDDEN_PAUSE_MS = 60_000;

function toCaptionTurns(apiTurns: TriageTurn[] | undefined, fallbackLang: Locale): TriageCaptionEvent[] {
  if (!apiTurns) return [];
  return apiTurns
    .filter((t) => t.role === "patient" || t.role === "assistant")
    .map((t) => ({
      role: t.role === "patient" ? "patient" : "assistant",
      text: t.text,
      lang: t.language_detected === "en" ? "en" : fallbackLang,
      at: t.at,
    }));
}

function storeActiveSessionId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.sessionStorage.setItem(TAB_SESSION_ID_KEY, id);
    else window.sessionStorage.removeItem(TAB_SESSION_ID_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function useTriageSessionController(initialLocale: Locale = "bn", resumeSessionId?: string) {
  const api = useApi();
  const [phase, setPhase] = useState<VoiceSessionState>(resumeSessionId ? "connecting" : "permission_prompt");
  const [language, setLanguageState] = useState<Locale>(initialLocale);
  const [textMode, setTextMode] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(resumeSessionId ?? null);
  const [sessionState, setSessionState] = useState<string | null>(null);
  const [interview, setInterview] = useState({ target: 7, max: 10 });
  const [sessionVersion, setSessionVersion] = useState<number | undefined>(undefined);
  const [turns, setTurns] = useState<TriageCaptionEvent[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [callSeconds, setCallSeconds] = useState(0);
  const [emergencyInstruction, setEmergencyInstruction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingResume, setLoadingResume] = useState<boolean>(Boolean(resumeSessionId));
  const [notFound, setNotFound] = useState(false);
  const [voicePlaceholderActive, setVoicePlaceholderActive] = useState(false);
  const [audioDevices, setAudioDevices] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [providerConfig, setProviderConfig] = useState<VoiceProviderConfig>({
    provider: "vapi_placeholder",
    speakerEnabled: true,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const voiceClientRef = useRef<VoiceClient | null>(null);
  const unbindRef = useRef<() => void>(() => undefined);
  const endingRef = useRef(false);
  const languageRef = useRef<Locale>(initialLocale);
  const sessionIdRef = useRef<string | null>(resumeSessionId ?? null);
  const versionRef = useRef<number | undefined>(undefined);
  const hiddenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  if (!voiceClientRef.current) {
    voiceClientRef.current = new PlaceholderVoiceClient(initialLocale);
  }

  /** POST through `useApi()` with one-time CSRF recovery (audit A-09, A-22). */
  const postWithCsrf = useCallback(
    async <T,>(path: string, body?: unknown, expectedVersion?: number): Promise<T> => {
      const idempotencyKey = createIntentIdempotencyKey();
      try {
        return (await api.post<T>(path, { body: body ?? {}, expectedVersion, idempotencyKey })).data;
      } catch (e) {
        if (e instanceof ApiError && (e.code === "csrf_failed" || /^CSRF Failed/i.test(e.message))) {
          await api.get("/auth/me").catch(() => undefined);
          return (await api.post<T>(path, { body: body ?? {}, expectedVersion, idempotencyKey })).data;
        }
        throw e;
      }
    },
    [api],
  );

  /** Shows the emergency screen when the session is in the emergency pathway (INV-16). Returns whether it did. */
  const showEmergencyIfAny = useCallback((data: TriageSessionDetail): boolean => {
    if (data.state !== "EMERGENCY_PATHWAY") return false;
    const emTurn = [...(data.turns ?? [])].reverse().find((t) => t.response_policy === "emergency");
    setEmergencyInstruction(
      emTurn?.text ?? "PLACEHOLDER — NOT CLINICALLY APPROVED: Go to the nearest emergency hospital immediately.",
    );
    setPhase("emergency");
    storeActiveSessionId(null);
    return true;
  }, []);

  /** The provider ended the call; if the server ended it for an emergency, show that screen. */
  const resyncAfterRemoteEnd = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    try {
      const { data } = await api.get<TriageSessionDetail>(`/triage/sessions/${id}`);
      setSessionState(data.state);
      showEmergencyIfAny(data);
    } catch {
      // keep the ended state; the patient can restart
    }
  }, [api, showEmergencyIfAny]);

  /** Subscribes the controller to one client and returns the unsubscribe. */
  const bindClient = useCallback(
    (client: VoiceClient) => {
      const unsubState = client.on("state", (s) => {
        if (s === "ended" && !endingRef.current) {
          void resyncAfterRemoteEnd();
        }
        setPhase(s);
      });
      const unsubLevel = client.on("level", (lvl) => setMicLevel(lvl));
      return () => {
        unsubState();
        unsubLevel();
      };
    },
    [resyncAfterRemoteEnd],
  );

  if (!voiceClientRef.current) {
    voiceClientRef.current = new PlaceholderVoiceClient(initialLocale);
  }

  // Unsubscribe BEFORE stopping tracks on unmount, so React StrictMode's simulated unmount
  // never leaks `"ended"` into `phase`.
  useEffect(() => {
    const client = voiceClientRef.current;
    if (!client) return;
    unbindRef.current = bindClient(client);
    return () => {
      unbindRef.current();
      stopTracks();
      void voiceClientRef.current?.end();
    };
  }, [bindClient, stopTracks]);

  useEffect(() => {
    languageRef.current = language;
    voiceClientRef.current?.setLanguage(language);
  }, [language]);

  useEffect(() => {
    setLanguageState(initialLocale);
    languageRef.current = initialLocale;
  }, [initialLocale]);

  // Hydrate an existing session when `/triage/session/[id]` mounts
  useEffect(() => {
    if (!resumeSessionId) return;
    let cancelled = false;
    setLoadingResume(true);
    setNotFound(false);
    setErrorMessage(null);

    api
      .get<TriageSessionDetail>(`/triage/sessions/${resumeSessionId}`)
      .then(({ data }) => {
        if (cancelled) return;
        sessionIdRef.current = data.id;
        versionRef.current = data.version;
        if (data.interview) setInterview(data.interview);
        setSessionId(data.id);
        setSessionState(data.state);
        setSessionVersion(data.version);
        const lang: Locale = data.language === "en" ? "en" : "bn";
        setLanguageState(lang);
        languageRef.current = lang;
        const isVoice = data.mode === "voice";
        setTextMode(!isVoice);
        setVoicePlaceholderActive(isVoice);
        const hydrated = toCaptionTurns(data.turns, lang);
        setTurns(hydrated);

        if (showEmergencyIfAny(data)) {
          // emergency screen shown
        } else if (data.state === "PAUSED") {
          setPhase("paused");
        } else if (data.state === "ENDED_BY_PATIENT" || data.state === "ABANDONED") {
          setPhase("ended");
          storeActiveSessionId(null);
        } else {
          setPhase("listening");
          storeActiveSessionId(data.id);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setNotFound(true);
        } else {
          setErrorMessage(e instanceof ApiError ? e.message : "Could not load session.");
        }
        setPhase("ended");
      })
      .finally(() => {
        if (!cancelled) setLoadingResume(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, resumeSessionId, showEmergencyIfAny]);

  // Call duration timer while session is active in voice mode
  useEffect(() => {
    const activePhases: VoiceSessionState[] = ["listening", "speaking", "thinking"];
    if (textMode || !activePhases.includes(phase)) return;
    const timer = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase, textMode]);

  // Pause & release microphone if tab stays hidden > 60s (FRONTEND §8.3)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.hidden && streamRef.current) {
        hiddenTimerRef.current = setTimeout(() => {
          stopTracks();
          voiceClientRef.current?.pause();
        }, TAB_HIDDEN_PAUSE_MS);
      } else if (hiddenTimerRef.current) {
        clearTimeout(hiddenTimerRef.current);
        hiddenTimerRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (hiddenTimerRef.current) clearTimeout(hiddenTimerRef.current);
    };
  }, [stopTracks]);

  const refreshAudioDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(
        devices
          .filter((d) => d.kind === "audioinput")
          .map((d, idx) => ({
            deviceId: d.deviceId || `mic-${idx}`,
            label: d.label || `Microphone ${idx + 1}`,
          })),
      );
    } catch {
      // Ignore device enumeration errors
    }
  }, []);

  const createBackendSession = useCallback(
    async (mode: "voice" | "text"): Promise<TriageSessionDetail> => {
      const data = await postWithCsrf<TriageSessionDetail>("/triage/sessions", {
        language: languageRef.current,
        mode,
        triage_disclosure_version: DISCLOSURE_VERSION,
      });
      sessionIdRef.current = data.id;
      versionRef.current = data.version;
      setSessionId(data.id);
      setSessionState(data.state);
      setSessionVersion(data.version);
      if (data.interview) setInterview(data.interview);
      setTurns(toCaptionTurns(data.turns, languageRef.current));
      storeActiveSessionId(data.id);
      return data;
    },
    [postWithCsrf],
  );

  const allowMicrophone = useCallback(async () => {
    setErrorMessage(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported_browser");
      setTextMode(true);
      setVoicePlaceholderActive(false);
      return;
    }

    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (providerConfig.selectedDeviceId) {
        audioConstraints.deviceId = { exact: providerConfig.selectedDeviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      streamRef.current = stream;
      setTextMode(false);
      setCallSeconds(0);
      void refreshAudioDevices();

      const session = sessionIdRef.current
        ? null
        : await createBackendSession("voice");
      const activeId = session?.id ?? sessionIdRef.current!;

      const creds = await postWithCsrf<VoiceCredentialsResponse>(
        `/triage/sessions/${activeId}/voice-credentials`,
        {},
      );
      setVoicePlaceholderActive(creds.status === "placeholder" || creds.provider === "vapi_placeholder");
      endingRef.current = false;
      const isVapi = creds.provider === "vapi";
      if (isVapi) {
        // Loaded on demand so the call code stays out of the first-load bundle.
        const { createVapiCall } = await import("./callSetup");
        unbindRef.current();
          const call = createVapiCall({
          language: languageRef.current,
          bindBase: bindClient,
          getSessionId: () => sessionIdRef.current,
          post: postWithCsrf,
          setTurns,
        });
        voiceClientRef.current = call.client;
        unbindRef.current = call.unbind;
        setPhase("ringing");
        streamRef.current = null; // the Vapi client releases the permission-probe stream itself
      }
      await voiceClientRef.current?.connect(
        {
          sessionRef: creds.session_ref,
          provider: creds.provider,
          token: creds.token,
          expiresAt: creds.expires_at,
          assistantId: creds.assistant_id,
        },
        stream,
      );
    } catch (e) {
      if (e instanceof ApiError) {
        stopTracks();
        setErrorMessage(e.message);
        setPhase("permission_prompt");
      } else {
        setPhase("permission_denied");
      }
    }
  }, [bindClient, createBackendSession, postWithCsrf, providerConfig.selectedDeviceId, refreshAudioDevices, stopTracks]);

  const callPhases: VoiceSessionState[] = ["ringing", "connected", "listening", "speaking", "thinking", "reconnecting", "connection_lost"];
  const callActive = !voicePlaceholderActive && !textMode && callPhases.includes(phase);

  const startTextSession = useCallback(async () => {
    setErrorMessage(null);
    stopTracks();
    if (callActive) {
      endingRef.current = true; // hang up the call only; the triage session continues in text
      void voiceClientRef.current?.end();
    } else {
      voiceClientRef.current?.pause();
    }
    setTextMode(true);
    setVoicePlaceholderActive(false);
    try {
      if (!sessionIdRef.current) {
        await createBackendSession("text");
      }
      setPhase("listening");
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.message : "Could not start session.");
      setPhase("permission_prompt");
    }
  }, [callActive, createBackendSession, stopTracks]);

  const sendTextTurn = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      setErrorMessage(null);

      let activeId = sessionIdRef.current;
      if (!activeId) {
        try {
          const created = await createBackendSession(textMode ? "text" : "voice");
          activeId = created.id;
        } catch (e) {
          setErrorMessage(e instanceof ApiError ? e.message : "Could not start session.");
          return;
        }
      }

      const currentLang = languageRef.current;
      setTurns((prev) => [
        ...prev,
        { role: "patient", text, lang: currentLang, at: new Date().toISOString() },
      ]);
      setPhase("thinking");

      try {
        const reply = await postWithCsrf<TriageTurnReply>(`/triage/sessions/${activeId}/turns`, { text });
        if (reply.response_policy === "emergency") {
          endingRef.current = true;
          stopTracks();
          await voiceClientRef.current?.end();
          storeActiveSessionId(null);
          setSessionState("EMERGENCY_PATHWAY");
          setEmergencyInstruction(
            reply.text ||
              "PLACEHOLDER — NOT CLINICALLY APPROVED: Go to the nearest emergency hospital immediately.",
          );
          setPhase("emergency");
          return;
        }

        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            text: reply.text,
            lang: reply.language_detected === "en" ? "en" : currentLang,
            at: reply.at || new Date().toISOString(),
          },
        ]);
        // The interview closed itself (fixed closing line): the view then opens the summary.
        setSessionState(reply.session_state ?? "ACTIVE");
        setPhase("listening");
      } catch (e) {
        setErrorMessage(e instanceof ApiError ? e.message : "Could not send message. Please try again.");
        setPhase("listening");
      }
    },
    [createBackendSession, postWithCsrf, stopTracks, textMode],
  );

  const pause = useCallback(async () => {
    stopTracks();
    voiceClientRef.current?.pause();
    const activeId = sessionIdRef.current;
    if (activeId && sessionState === "ACTIVE") {
      try {
        const updated = await postWithCsrf<TriageSessionDetail>(
          `/triage/sessions/${activeId}/pause`,
          {},
          versionRef.current,
        );
        versionRef.current = updated.version;
        setSessionVersion(updated.version);
        setSessionState(updated.state);
      } catch {
        // Local pause already stopped tracks
      }
    }
  }, [postWithCsrf, sessionState, stopTracks]);

  const resume = useCallback(async () => {
    const activeId = sessionIdRef.current;
    if (activeId && sessionState === "PAUSED") {
      try {
        const updated = await postWithCsrf<TriageSessionDetail>(
          `/triage/sessions/${activeId}/resume`,
          {},
          versionRef.current,
        );
        versionRef.current = updated.version;
        setSessionVersion(updated.version);
        setSessionState(updated.state);
      } catch {
        // Ignore if already active
      }
    }
    voiceClientRef.current?.resume();
    setPhase("listening");
  }, [postWithCsrf, sessionState]);

  const finish = useCallback(async (): Promise<string | null> => {
    endingRef.current = true;
    stopTracks();
    await voiceClientRef.current?.end();
    const activeId = sessionIdRef.current;
    if (!activeId) return null;
    try {
      let currentState = sessionState;
      if (currentState === "PAUSED") {
        const resumed = await postWithCsrf<TriageSessionDetail>(
          `/triage/sessions/${activeId}/resume`,
          {},
          versionRef.current,
        );
        versionRef.current = resumed.version;
        setSessionVersion(resumed.version);
        setSessionState(resumed.state);
        currentState = resumed.state;
      }
      if (currentState === "ACTIVE" || !currentState) {
        const updated = await postWithCsrf<TriageSessionDetail>(
          `/triage/sessions/${activeId}/finish`,
          {},
          versionRef.current,
        );
        versionRef.current = updated.version;
        setSessionVersion(updated.version);
        setSessionState(updated.state);
      }
    } catch {
      // Summary page will also check state before confirm
    }
    return activeId;
  }, [postWithCsrf, sessionState, stopTracks]);

  const end = useCallback(async () => {
    endingRef.current = true;
    stopTracks();
    await voiceClientRef.current?.end();
    const activeId = sessionIdRef.current;
    storeActiveSessionId(null);
    if (activeId && sessionState && !["ENDED_BY_PATIENT", "CONFIRMED_BY_PATIENT", "EMERGENCY_PATHWAY", "ABANDONED"].includes(sessionState)) {
      try {
        const updated = await postWithCsrf<TriageSessionDetail>(
          `/triage/sessions/${activeId}/end`,
          {},
          versionRef.current,
        );
        versionRef.current = updated.version;
        setSessionVersion(updated.version);
        setSessionState(updated.state);
      } catch {
        // Session may already be closed
      }
    }
  }, [postWithCsrf, sessionState, stopTracks]);

  const patientTurnCount = turns.filter((t) => t.role === "patient").length;

  return {
    phase,
    language,
    textMode,
    sessionId,
    sessionState,
    sessionVersion,
    turns,
    patientTurnCount,
    interview,
    interimText: "",
    draftSummary: { turnCount: patientTurnCount },
    bargeIn: () => undefined,
    micLevel,
    callSeconds,
    emergencyInstruction,
    errorMessage,
    loadingResume,
    notFound,
    voicePlaceholderActive,
    audioDevices,
    providerConfig,
    setLanguage: (l: Locale) => {
      setLanguageState(l);
      languageRef.current = l;
      voiceClientRef.current?.setLanguage(l);
    },
    updateProvider: (patch: Partial<VoiceProviderConfig>) => {
      setProviderConfig((prev) => ({ ...prev, ...patch }));
    },
    callActive,
    setMuted: (m: boolean) => voiceClientRef.current?.setMuted?.(m),
    allowMicrophone,
    startTextSession,
    switchToText: startTextSession,
    sendTextTurn,
    pause,
    resume,
    finish,
    end,
  };
}
