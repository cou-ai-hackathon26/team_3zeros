"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Locale } from "../i18n/config";
import type {
  TriageCaptionEvent,
  TriageDraftSummary,
  VoiceProviderConfig,
  VoiceSessionState,
} from "./types";
import { WebRtcVoiceClient } from "./webrtcClient";

const STORAGE_DRAFT_KEY = "mw_triage_draft";
const STORAGE_PROVIDER_KEY = "mw_voice_provider_cfg";

function evaluateClientRedFlag(
  text: string,
  lang: Locale
): { isEmergency: boolean; instruction: string } {
  const lower = text.toLowerCase();
  const negatedEn = /\b(no|not|don't have|without|denies|never)\b/i.test(lower);
  const negatedBn = /(নেই|নাই|ব্যথা নেই|কষ্ট নেই)/.test(lower);

  const hasRedFlag =
    /বুকে ব্যথা|বুকে চাপ|বুকে তীব্র ব্যথা|হার্ট অ্যাটাক|তীব্র শ্বাসকষ্ট|শ্বাস নিতে পারছি না|শ্বাস বন্ধ|মুখ বাঁকা|প্যারালাইসিস|রক্তবমি|প্রচুর রক্তপাত|chest pain|pressure in chest|heart attack|cannot breathe|shortness of breath|struggling to breathe|slurred speech|facial drooping|vomiting blood|coughing up blood|unconscious/i.test(
      text
    );

  if (hasRedFlag && !negatedEn && !negatedBn) {
    return {
      isEmergency: true,
      instruction:
        lang === "bn"
          ? "PLACEHOLDER — NOT CLINICALLY APPROVED: আপনার লক্ষণগুলি জরুরি অবস্থার ইঙ্গিত দিচ্ছে। অবিলম্বে ৯৯৯ নম্বরে কল করুন অথবা নিকটস্থ হাসপাতালের জরুরি বিভাগে যান।"
          : "PLACEHOLDER — NOT CLINICALLY APPROVED: Your symptoms indicate a potential medical emergency. Please call 999 or visit the nearest hospital emergency department immediately.",
    };
  }
  return { isEmergency: false, instruction: "" };
}

function buildLocalTurnResponseAndDraft(
  patientTurns: string[],
  lang: Locale,
  sessionId: string
): { assistantText: string; draft: TriageDraftSummary } {
  const turnCount = patientTurns.length;
  const combined = patientTurns.join(" | ");
  const lower = combined.toLowerCase();

  let specialtyEn = "Internal Medicine";
  let specialtyBn = "মেডিসিন (Internal Medicine)";
  if (/শিশু|বাচ্চা|child|baby|pediatric/i.test(lower)) {
    specialtyEn = "Pediatrics";
    specialtyBn = "শিশুরোগ (Pediatrics)";
  } else if (/চর্ম|চুলকানি|র‍্যাশ|skin|rash|itch/i.test(lower)) {
    specialtyEn = "Dermatology";
    specialtyBn = "চর্মরোগ (Dermatology)";
  } else if (/গর্ভ|মাসিক|প্রসূতি|pregnancy|gyne|period/i.test(lower)) {
    specialtyEn = "Gynecology & Obstetrics";
    specialtyBn = "স্ত্রীরোগ ও প্রসূতিবিদ্যা (Gynecology)";
  } else if (/হাড়|কোমর|হাঁটু|জয়েন্ট|joint|knee|back pain/i.test(lower)) {
    specialtyEn = "Orthopedics";
    specialtyBn = "অর্থোপেডিকস (Orthopedics)";
  }

  const duration =
    turnCount >= 2
      ? patientTurns[1]
      : /৩|3|দিন|day|সপ্তাহ|week/i.test(lower)
        ? lang === "bn"
          ? "৩ দিন ধরে"
          : "3 days"
        : lang === "bn"
          ? "জিজ্ঞাসা করা হচ্ছে…"
          : "Asking…";

  const severity = /তীব্র|বেশি|প্রচণ্ড|severe|high/i.test(lower)
    ? lang === "bn"
      ? "তীব্র (Severe)"
      : "Severe"
    : /হালকা|কম|mild|light/i.test(lower)
      ? lang === "bn"
        ? "হালকা (Mild)"
        : "Mild"
      : lang === "bn"
        ? "মাঝারি (Moderate)"
        : "Moderate";

  const draft: TriageDraftSummary = {
    sessionId,
    patientWords: combined,
    chiefComplaint: patientTurns[0] ?? "",
    duration,
    severity,
    additionalNotes: patientTurns.slice(2).join("; "),
    redFlagStatus:
      lang === "bn"
        ? "কোনো জরুরি ঝুঁকির লক্ষণ পাওয়া যায়নি"
        : "No emergency risk signs detected",
    suggestedSpecialtyBn: specialtyBn,
    suggestedSpecialtyEn: specialtyEn,
    turnCount,
  };

  let assistantText: string;
  if (turnCount === 1) {
    assistantText =
      lang === "bn"
        ? `আমি শুনেছি: “${patientTurns[0]}”। এই সমস্যাটি কতদিন ধরে হচ্ছে এবং তীব্রতা কেমন—হালকা, মাঝারি, নাকি বেশি?`
        : `I heard: "${patientTurns[0]}". How many days have you had this symptom, and is the discomfort mild, moderate, or severe?`;
  } else if (turnCount === 2) {
    assistantText =
      lang === "bn"
        ? "বুঝেছি। এর সাথে কি জ্বর, বমি ভাব, মাথা ঘোরা কিংবা ডায়াবেটিস বা উচ্চ রক্তচাপের মতো কোনো পূর্ববর্তী সমস্যা আছে?"
        : "Understood. Do you also have fever, nausea, dizziness, or any existing conditions such as diabetes or high blood pressure?";
  } else if (turnCount === 3) {
    assistantText =
      lang === "bn"
        ? `ধন্যবাদ। আপনার লক্ষণ অনুযায়ী ${specialtyBn} বিভাগের ডাক্তার দেখানো উপযুক্ত হবে। আপনি কি বর্তমানে কোনো ওষুধ খাচ্ছেন, নাকি এখনই খসড়া সারাংশ যাচাই করতে চান?`
        : `Thank you. Based on your symptoms, a consultation in ${specialtyEn} is appropriate. Are you currently taking any medications, or would you like to review your summary now?`;
  } else {
    assistantText =
      lang === "bn"
        ? `${specialtyBn} ডাক্তারের জন্য আপনার খসড়া সারাংশ প্রস্তুত। আরও কিছু যোগ করতে চাইলে বলুন, অথবা নিচে ‘সারাংশ যাচাই করুন’ বাটনে চাপুন।`
        : `Your clinical intake summary for ${specialtyEn} is ready. You can share any extra detail by voice, or tap 'Finish & review summary' below.`;
  }

  return { assistantText, draft };
}

export function useTriageSessionController(initialLocale: Locale = "bn") {
  const [phase, setPhase] = useState<VoiceSessionState>("permission_prompt");
  const [language, setLanguageState] = useState<Locale>(initialLocale);
  const [textMode, setTextMode] = useState(false);
  const [sessionId, setSessionId] = useState<string>("sess-1");
  const [turns, setTurns] = useState<TriageCaptionEvent[]>([]);
  const [interimText, setInterimText] = useState<string>("");
  const [micLevel, setMicLevel] = useState(0);
  const [callSeconds, setCallSeconds] = useState(0);
  const [emergencyInstruction, setEmergencyInstruction] = useState<string | null>(null);
  const [audioDevices, setAudioDevices] = useState<Array<{ deviceId: string; label: string }>>([]);
  const envProvider =
    typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_VOICE_PROVIDER === "elevenlabs" ||
      process.env.NEXT_PUBLIC_VOICE_PROVIDER === "vapi")
      ? process.env.NEXT_PUBLIC_VOICE_PROVIDER
      : typeof process !== "undefined" && process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY
        ? "elevenlabs"
        : typeof process !== "undefined" && process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY
          ? "vapi"
          : "browser_speech";

  const [providerConfig, setProviderConfig] = useState<VoiceProviderConfig>({
    provider: envProvider,
    speakerEnabled: true,
  });
  const [draftSummary, setDraftSummary] = useState<TriageDraftSummary>({
    sessionId: "sess-1",
    patientWords: "",
    chiefComplaint: "",
    duration: "",
    severity: "",
    additionalNotes: "",
    redFlagStatus:
      initialLocale === "bn"
        ? "স্বাভাবিক পর্যবেক্ষণ চালু"
        : "Active safety monitoring",
    suggestedSpecialtyBn: "মেডিসিন (Internal Medicine)",
    suggestedSpecialtyEn: "Internal Medicine",
    turnCount: 0,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const voiceClientRef = useRef<WebRtcVoiceClient | null>(null);
  const patientTurnsRef = useRef<string[]>([]);
  const languageRef = useRef<Locale>(initialLocale);
  const sessionIdRef = useRef<string>("sess-1");
  const textModeRef = useRef<boolean>(false);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    setLanguageState(initialLocale);
    languageRef.current = initialLocale;
  }, [initialLocale]);

  // Restore saved provider config from sessionStorage if available
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_PROVIDER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<VoiceProviderConfig>;
        setProviderConfig((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  // Call duration timer while session is active
  useEffect(() => {
    const activePhases: VoiceSessionState[] = ["listening", "speaking", "thinking"];
    if (!activePhases.includes(phase)) return;
    const timer = setInterval(() => {
      setCallSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }, []);

  const persistDraft = useCallback((draft: TriageDraftSummary) => {
    setDraftSummary(draft);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(STORAGE_DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // Ignore storage quota errors
      }
    }
  }, []);

  const handlePatientUtterance = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;

      const currentLang = languageRef.current;
      const nowIso = new Date().toISOString();

      setInterimText("");
      setTurns((prev) => [
        ...prev,
        { role: "patient", text, lang: currentLang, at: nowIso },
      ]);
      patientTurnsRef.current = [...patientTurnsRef.current, text];
      setPhase("thinking");

      // 1. Immediate client-side deterministic red-flag guard (INV-8)
      const localRf = evaluateClientRedFlag(text, currentLang);
      if (localRf.isEmergency) {
        stopTracks();
        await voiceClientRef.current?.end();
        setEmergencyInstruction(localRf.instruction);
        setPhase("emergency");
        return;
      }

      // 2. Try posting to live Django backend /api/v1/triage/sessions/{id}/turns
      let backendReplyText: string | null = null;
      let backendEmergency = false;
      const activeId = sessionIdRef.current;

      if (
        activeId &&
        activeId !== "sess-1" &&
        typeof window !== "undefined" &&
        typeof fetch === "function"
      ) {
        try {
          const res = await fetch(`/api/v1/triage/sessions/${activeId}/turns`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          if (res.ok) {
            const turnData = (await res.json()) as {
              text?: string;
              response_policy?: string;
            };
            if (turnData.response_policy === "emergency") {
              backendEmergency = true;
              backendReplyText = turnData.text ?? null;
            } else if (turnData.text) {
              backendReplyText = turnData.text;
            }
          }
        } catch {
          // Fall back to local progressive dialogue
        }
      }

      if (backendEmergency) {
        const msg =
          backendReplyText ||
          (currentLang === "bn"
            ? "PLACEHOLDER — NOT CLINICALLY APPROVED: অনুগ্রহ করে এখনই নিকটস্থ হাসপাতালের জরুরি বিভাগে যান।"
            : "PLACEHOLDER — NOT CLINICALLY APPROVED: Please go to the nearest emergency hospital immediately.");
        stopTracks();
        await voiceClientRef.current?.end();
        setEmergencyInstruction(msg);
        setPhase("emergency");
        return;
      }

      // 3. Build progressive intake draft & assistant question
      const { assistantText: localReply, draft } = buildLocalTurnResponseAndDraft(
        patientTurnsRef.current,
        currentLang,
        activeId
      );
      const replyText = backendReplyText ?? localReply;
      persistDraft(draft);

      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          text: replyText,
          lang: currentLang,
          at: new Date().toISOString(),
        },
      ]);

      // 4. Speak the response out loud if in voice mode
      if (!textModeRef.current && voiceClientRef.current) {
        await voiceClientRef.current.speakAssistantText(replyText, currentLang);
      } else {
        setPhase("listening");
      }
    },
    [persistDraft, stopTracks]
  );

  // Initialize WebRtcVoiceClient once
  if (!voiceClientRef.current) {
    const client = new WebRtcVoiceClient({
      initialLanguage: initialLocale,
      providerConfig,
      onInterim: (txt) => setInterimText(txt),
      onUtterance: handlePatientUtterance,
    });
    client.on("state", (s) => setPhase(s));
    client.on("level", (lvl) => setMicLevel(lvl));
    client.on("caption", (c) => setTurns((prev) => [...prev, c]));
    voiceClientRef.current = client;
  }

  useEffect(() => {
    return () => {
      stopTracks();
      void voiceClientRef.current?.end();
    };
  }, [stopTracks]);

  const startBackendSession = useCallback(
    async (mode: "voice" | "text", lang: Locale): Promise<{ id: string; greeting: string }> => {
      const defaultGreeting =
        lang === "bn"
          ? "নমস্কার, আমি আপনার মেডি ওয়েপয়েন্ট স্বাস্থ্য সহকারী। আজ আপনার কী শারীরিক সমস্যা হচ্ছে, নিজের ভাষায় বলুন।"
          : "Hello, I am your Medi Waypoint health guide. Please tell me in your own words what symptoms you are experiencing today.";

      if (typeof window !== "undefined" && typeof fetch === "function") {
        try {
          const res = await fetch("/api/v1/triage/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              language: lang,
              mode,
              triage_disclosure_version: "v1.0",
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as {
              id?: string;
              turns?: Array<{ role: string; text: string }>;
            };
            const newId = data.id || "sess-1";
            const firstAssistant = data.turns?.find((t) => t.role === "assistant")?.text;
            return { id: newId, greeting: firstAssistant || defaultGreeting };
          }
        } catch {
          // Offline or test environment: use local session seamlessly
        }
      }
      return { id: "sess-1", greeting: defaultGreeting };
    },
    []
  );

  const refreshAudioDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter((d) => d.kind === "audioinput")
        .map((d, idx) => ({
          deviceId: d.deviceId || `mic-${idx}`,
          label: d.label || `Microphone ${idx + 1}`,
        }));
      setAudioDevices(inputs);
    } catch {
      // Ignore enumeration errors
    }
  }, []);

  const allowMicrophone = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported_browser");
      setTextMode(true);
      textModeRef.current = true;
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

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      streamRef.current = stream;
      textModeRef.current = false;
      setTextMode(false);
      setCallSeconds(0);
      setMicLevel(0.28);

      void refreshAudioDevices();

      const currentLang = languageRef.current;
      const { id, greeting } = await startBackendSession("voice", currentLang);
      sessionIdRef.current = id;
      setSessionId(id);

      await voiceClientRef.current?.connect(
        { sessionRef: id, provider: providerConfig.provider, token: "live-token" },
        stream
      );

      const greetingTurn: TriageCaptionEvent = {
        role: "assistant",
        text: greeting,
        lang: currentLang,
        at: new Date().toISOString(),
      };
      setTurns([greetingTurn]);

      // Speak the assistant greeting out loud immediately!
      await voiceClientRef.current?.speakAssistantText(greeting, currentLang);
    } catch {
      setPhase("permission_denied");
    }
  }, [providerConfig.provider, providerConfig.selectedDeviceId, refreshAudioDevices, startBackendSession]);

  const switchToText = useCallback(async () => {
    stopTracks();
    voiceClientRef.current?.stopSpeaking();
    textModeRef.current = true;
    setTextMode(true);
    setPhase("listening");

    if (turns.length === 0) {
      const currentLang = languageRef.current;
      const { id, greeting } = await startBackendSession("text", currentLang);
      sessionIdRef.current = id;
      setSessionId(id);
      setTurns([
        {
          role: "assistant",
          text: greeting,
          lang: currentLang,
          at: new Date().toISOString(),
        },
      ]);
    }
  }, [startBackendSession, stopTracks, turns.length]);

  const sendTextTurn = useCallback(
    async (text: string) => {
      await handlePatientUtterance(text);
    },
    [handlePatientUtterance]
  );

  const updateProvider = useCallback((patch: Partial<VoiceProviderConfig>) => {
    setProviderConfig((prev) => {
      const next = { ...prev, ...patch };
      voiceClientRef.current?.updateProviderConfig(next);
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(STORAGE_PROVIDER_KEY, JSON.stringify(next));
        } catch {
          // Ignore
        }
      }
      return next;
    });
  }, []);

  const bargeIn = useCallback(() => {
    voiceClientRef.current?.stopSpeaking();
    voiceClientRef.current?.resume();
    setPhase("listening");
  }, []);

  return {
    phase,
    language,
    textMode,
    sessionId,
    turns,
    interimText,
    micLevel,
    callSeconds,
    emergencyInstruction,
    audioDevices,
    providerConfig,
    draftSummary,
    setLanguage: (l: Locale) => {
      setLanguageState(l);
      languageRef.current = l;
      voiceClientRef.current?.setLanguage(l);
    },
    updateProvider,
    allowMicrophone,
    switchToText,
    sendTextTurn,
    bargeIn,
    pause: () => voiceClientRef.current?.pause(),
    resume: () => voiceClientRef.current?.resume(),
    end: () => voiceClientRef.current?.end(),
  };
}
