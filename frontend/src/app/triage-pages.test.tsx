import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const nav = {
  pathname: "/en/triage",
  search: "",
  params: {} as Record<string, string>,
  push: vi.fn(),
  replace: vi.fn(),
};

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => nav.params,
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));

import { createApiClient } from "../api/client";
import { AppProviders, makeQueryClient } from "../api/queries/provider";
import { PatientShell } from "../components/shell/PatientShell";
import TriagePage from "./[locale]/(patient)/triage/page";
import TriageSessionResumePage from "./[locale]/(patient)/triage/session/[id]/page";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mount(ui: React.ReactNode, handler: (url: string, method: string, body: unknown) => Response | Promise<Response>) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const req = input instanceof Request ? input : null;
    const url = req ? req.url : typeof input === "string" ? input : input.toString();
    const method = req ? req.method : (init?.method ?? "GET");
    let body: unknown = null;
    if (req && method !== "GET") {
      try {
        body = await req.clone().json();
      } catch {
        body = null;
      }
    }
    calls.push({ url, method, body });
    return handler(url, method, body);
  };
  const api = createApiClient({ baseUrl: "/api/v1", fetchImpl });
  const result = render(
    <AppProviders client={api} queryClient={makeQueryClient()}>
      {ui}
    </AppProviders>,
  );
  return { ...result, calls };
}

afterEach(() => {
  nav.pathname = "/en/triage";
  nav.search = "";
  nav.params = {};
  nav.push.mockReset();
  nav.replace.mockReset();
  window.sessionStorage.clear();
});

describe("Task 6 — Triage focus shell, disclosure gate, Vapi placeholder, emergency facilities, and session resume", () => {
  it("triage?mode=text requires explicit disclosure confirmation before creating a backend session (Review Focus #4)", async () => {
    nav.pathname = "/en/triage";
    nav.search = "mode=text";

    const { calls } = mount(<TriagePage params={Promise.resolve({ locale: "en" })} />, (url, method) => {
      if (url.endsWith("/triage/sessions") && method === "POST") {
        return json({
          id: "sess-text-1",
          state: "ACTIVE",
          allowed_actions: ["pause", "finish_questions", "end"],
          version: 2,
          language: "en",
          mode: "text",
          turns: [{ id: "t1", role: "assistant", text: "What symptoms?", language_detected: "en", at: "2026-11-23T10:00:00Z" }],
          summary: null,
        }, 201);
      }
      return json({});
    });

    // Must NOT auto-create a session on mount
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.filter((c) => c.url.endsWith("/triage/sessions") && c.method === "POST")).toHaveLength(0);

    // Disclosure screen visible with text button disabled until disclosure accepted
    const checkbox = screen.getByRole("checkbox");
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    const startTextBtn = screen.getByRole("button", { name: /start writing|type instead/i });
    expect((startTextBtn as HTMLButtonElement).disabled).toBe(true);

    // Accept disclosure and start text triage
    fireEvent.click(checkbox);
    expect((startTextBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(startTextBtn);

    await waitFor(() => expect(screen.getByText("What symptoms?")).toBeTruthy());
    expect(calls.filter((c) => c.url.endsWith("/triage/sessions") && c.method === "POST")).toHaveLength(1);
  });

  it("voice mode shows Vapi placeholder notice and lets patient continue with text turns", async () => {
    nav.pathname = "/en/triage";
    const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream), enumerateDevices: vi.fn().mockResolvedValue([]) },
    });

    mount(<TriagePage params={Promise.resolve({ locale: "en" })} />, (url, method) => {
      if (url.endsWith("/triage/sessions") && method === "POST") {
        return json({
          id: "sess-voice-1",
          state: "ACTIVE",
          version: 2,
          language: "en",
          mode: "voice",
          turns: [{ id: "t1", role: "assistant", text: "Hello care guide", language_detected: "en", at: "2026-11-23T10:00:00Z" }],
          summary: null,
        }, 201);
      }
      if (url.includes("/voice-credentials") && method === "POST") {
        return json({ session_ref: "ref-1", provider: "vapi_placeholder", token: "placeholder-tok", expires_at: "2026-11-23T10:05:00Z", status: "placeholder" });
      }
      if (url.includes("/turns") && method === "POST") {
        return json({ id: "t2", role: "assistant", text: "How long have you had this?", language_detected: "en", response_policy: "question", at: "2026-11-23T10:01:00Z" });
      }
      return json({});
    });

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /allow microphone/i }));

    await waitFor(() => expect(screen.getByText(/Voice agent placeholder/i)).toBeTruthy());
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Fever for 2 days" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(screen.getByText("How long have you had this?")).toBeTruthy());
  });

  it("emergency interrupt renders static EmergencyScreen and loads nearest emergency facilities on click", async () => {
    nav.pathname = "/en/triage";
    nav.search = "mode=text";

    mount(<TriagePage params={Promise.resolve({ locale: "en" })} />, (url, method) => {
      if (url.endsWith("/triage/sessions") && method === "POST") {
        return json({
          id: "sess-em-1",
          state: "ACTIVE",
          version: 2,
          language: "en",
          mode: "text",
          turns: [{ id: "t1", role: "assistant", text: "What symptoms?", language_detected: "en", at: "2026-11-23T10:00:00Z" }],
          summary: null,
        }, 201);
      }
      if (url.includes("/turns") && method === "POST") {
        return json({
          id: "t2",
          role: "assistant",
          text: "PLACEHOLDER — NOT CLINICALLY APPROVED: Go to the nearest emergency room immediately.",
          language_detected: "en",
          response_policy: "emergency",
          at: "2026-11-23T10:01:00Z",
        });
      }
      if (url.includes("/directory/facilities")) {
        return json({
          results: [
            {
              id: "fac-1",
              name: "Dhaka Medical College Hospital",
              name_bn: "ঢাকা মেডিকেল কলেজ হাসপাতাল",
              area_name: "Dhaka District",
              address: "Secretariat Road, Dhaka",
              phone: "+8801711000002",
              latest_capacity: {
                reported_value: { vacant_beds: 12 },
                reported_at: "2026-11-23T08:00:00Z",
                source: "manual",
                is_stale: false,
              },
            },
          ],
          next_cursor: null,
        });
      }
      return json({});
    });

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /start writing|type instead/i }));
    await waitFor(() => expect(screen.getByText("What symptoms?")).toBeTruthy());

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Severe chest pain" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(screen.getByText(/This may be an emergency/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Show nearest emergency facilities/i }));
    await waitFor(() => expect(screen.getByText("Dhaka Medical College Hospital")).toBeTruthy());
    expect(screen.getByText(/Secretariat Road, Dhaka/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /\+8801711000002/ })).toBeTruthy();
  });

  it("resumes an existing session at /triage/session/[id] by loading turns from the API", async () => {
    nav.pathname = "/en/triage/session/sess-resume-1";
    nav.params = { locale: "en", id: "sess-resume-1" };

    mount(<TriageSessionResumePage params={Promise.resolve({ locale: "en" })} />, (url, method) => {
      if (url.endsWith("/triage/sessions/sess-resume-1") && method === "GET") {
        return json({
          id: "sess-resume-1",
          state: "ACTIVE",
          version: 3,
          language: "en",
          mode: "text",
          turns: [
            { id: "t1", role: "assistant", text: "Welcome back question", language_detected: "en", at: "2026-11-23T10:00:00Z" },
            { id: "t2", role: "patient", text: "Persistent cough", language_detected: "en", at: "2026-11-23T10:00:20Z" },
          ],
          summary: { patient_words: "Persistent cough", structured_fields: {} },
        });
      }
      return json({});
    });

    await waitFor(() => expect(screen.getByText("Welcome back question")).toBeTruthy());
    expect(screen.getByText(/Persistent cough/)).toBeTruthy();
  });

  it("PatientShell switches to distraction-free Focus mode on /triage", async () => {
    nav.pathname = "/en/triage";

    mount(
      <PatientShell>
        <div>Triage body</div>
      </PatientShell>,
      (url) => {
        if (url.endsWith("/auth/me")) {
          return json({
            id: "u1",
            patient_id: "p1",
            email: "p@example.com",
            phone: null,
            display_name: "Karim",
            preferred_language: "en",
            roles: ["patient"],
            active_facility: null,
            permissions: [],
            is_platform_admin: false,
          });
        }
        return json({ results: [], next_cursor: null, consents: [], pending_requests: [] });
      },
    );

    await waitFor(() => expect(screen.getByText("Triage body")).toBeTruthy());
    expect(screen.queryByRole("navigation", { name: /main navigation/i })).toBeNull();
    expect(screen.getByRole("link", { name: /exit|back/i })).toBeTruthy();
  });
});
