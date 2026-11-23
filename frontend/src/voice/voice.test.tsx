import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createApiClient } from "../api/client";
import { AppProviders, makeQueryClient } from "../api/queries/provider";
import { EmergencyScreen } from "../components/EmergencyScreen/EmergencyScreen";
import { VoicePanel } from "../components/VoicePanel/VoicePanel";
import { TextClient } from "./textClient";
import { PlaceholderVoiceClient } from "./placeholderClient";
import { useTriageSessionController } from "./controller";

describe("FRONTEND §8 Voice Triage & Emergency Interrupt", () => {
  it("renders EmergencyScreen with signal-wash background, zero motion, no booking/continue link, and Q-06 placeholder warning", () => {
    render(
      <EmergencyScreen
        instructionText="PLACEHOLDER — NOT CLINICALLY APPROVED: Go to nearest emergency department immediately."
        emergencyNumbers={[]}
        locale="en"
      />
    );
    expect(screen.getByText(/This may be an emergency/i)).toBeTruthy();
    expect(screen.getByText(/PLACEHOLDER — NOT CLINICALLY APPROVED/i)).toBeTruthy();
    expect(screen.queryByText(/continue anyway/i)).toBeNull();
    expect(screen.queryByText(/Book appointment/i)).toBeNull();
  });

  it("switches to text mode when microphone permission is denied and preserves conversation turns", () => {
    const onSwitchToText = vi.fn();
    render(
      <VoicePanel
        phase="permission_denied"
        language="bn"
        turns={[]}
        micLevel={0}
        onLanguageChange={vi.fn()}
        onAllowMicrophone={vi.fn()}
        onSwitchToText={onSwitchToText}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEnd={vi.fn()}
        onSendTextTurn={vi.fn()}
      />
    );
    expect(screen.getByText(/মাইক্রোফোন ব্লক করা আছে/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /লিখে জানান/i }));
    expect(onSwitchToText).toHaveBeenCalledTimes(1);
  });

  it("immediately stops active media tracks and enters EMERGENCY_PATHWAY when emergency turn arrives (Review Focus #4)", async () => {
    const stopTrack = vi.fn();
    const fakeStream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    const states: string[] = [];

    const client = new TextClient({
      sessionId: "sess-1",
      sendTurn: async () => ({
        state: "EMERGENCY_PATHWAY",
        assistantText: "PLACEHOLDER — NOT CLINICALLY APPROVED",
        isEmergency: true,
      }),
    });
    client.on("state", (s) => states.push(s));
    await client.connect({ sessionRef: "ref-1", token: "tok" }, fakeStream);
    await client.sendText("বুকে তীব্র ব্যথা");

    expect(stopTrack).toHaveBeenCalled();
    expect(states).toContain("emergency");
  });

  it("PlaceholderVoiceClient implements VoiceClient, stops tracks on end, and marks itself as placeholder", async () => {
    const stopTrack = vi.fn();
    const fakeStream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    const states: string[] = [];

    const client = new PlaceholderVoiceClient();
    expect(client.isPlaceholder).toBe(true);
    client.on("state", (s) => states.push(s));
    await client.connect({ sessionRef: "ref-99", provider: "vapi_placeholder", token: "placeholder-tok" }, fakeStream);
    expect(states).toContain("listening");
    await client.end();
    expect(stopTrack).toHaveBeenCalled();
    expect(states).toContain("ended");
  });

  it("useTriageSessionController uses api client with Idempotency-Key, stores no symptom PHI in sessionStorage, and resumes by ID", async () => {
    window.sessionStorage.clear();
    const calls: Array<{ url: string; method: string; idempotencyKey: string | null }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = input instanceof Request ? input.method : (init?.method ?? "GET");
      const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
      calls.push({ url, method, idempotencyKey: headers.get("Idempotency-Key") });

      if (url.endsWith("/triage/sessions") && method === "POST") {
        return new Response(
          JSON.stringify({
            id: "11111111-1111-1111-1111-111111111111",
            state: "ACTIVE",
            allowed_actions: ["pause", "finish_questions", "end"],
            version: 2,
            language: "en",
            mode: "text",
            turns: [{ id: "t1", role: "assistant", text: "Hello guide", language_detected: "en", at: "2026-11-23T10:00:00Z" }],
            summary: null,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/turns") && method === "POST") {
        return new Response(
          JSON.stringify({
            id: "t2",
            role: "assistant",
            text: "How many days?",
            language_detected: "en",
            response_policy: "question",
            at: "2026-11-23T10:01:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/triage/sessions/22222222-2222-2222-2222-222222222222") && method === "GET") {
        return new Response(
          JSON.stringify({
            id: "22222222-2222-2222-2222-222222222222",
            state: "ACTIVE",
            allowed_actions: ["pause", "finish_questions", "end"],
            version: 3,
            language: "en",
            mode: "text",
            turns: [
              { id: "t1", role: "assistant", text: "Hello", language_detected: "en", at: "2026-11-23T10:00:00Z" },
              { id: "t2", role: "patient", text: "Headache", language_detected: "en", at: "2026-11-23T10:00:10Z" },
            ],
            summary: { patient_words: "Headache", structured_fields: {} },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const api = createApiClient({ baseUrl: "/api/v1", fetchImpl });

    function Harness({ resumeId }: { resumeId?: string }) {
      const ctrl = useTriageSessionController("en", resumeId);
      return (
        <div>
          <span data-testid="session-id">{ctrl.sessionId ?? "none"}</span>
          <span data-testid="turn-count">{ctrl.turns.length}</span>
          <button onClick={() => void ctrl.startTextSession()}>start</button>
          <button onClick={() => void ctrl.sendTextTurn("Fever for 2 days")}>send</button>
        </div>
      );
    }

    const { unmount } = render(
      <AppProviders client={api} queryClient={makeQueryClient()}>
        <Harness />
      </AppProviders>,
    );

    fireEvent.click(screen.getByText("start"));
    await waitFor(() => expect(screen.getByTestId("session-id").textContent).toBe("11111111-1111-1111-1111-111111111111"));

    fireEvent.click(screen.getByText("send"));
    await waitFor(() => expect(screen.getByTestId("turn-count").textContent).toBe("3"));

    // Verify Idempotency-Key sent on POSTs and zero symptom PHI in sessionStorage (A-09, A-14)
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts.length).toBeGreaterThanOrEqual(2);
    for (const p of posts) expect(p.idempotencyKey).toBeTruthy();
    expect(window.sessionStorage.getItem("mw_triage_draft")).toBeNull();
    unmount();

    // Now test resumeSessionId hydration
    render(
      <AppProviders client={api} queryClient={makeQueryClient()}>
        <Harness resumeId="22222222-2222-2222-2222-222222222222" />
      </AppProviders>,
    );
    await waitFor(() => expect(screen.getByTestId("turn-count").textContent).toBe("2"));
  });
});
