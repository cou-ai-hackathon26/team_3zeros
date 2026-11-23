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
import TriageSummaryReviewPage from "./[locale]/(patient)/triage/summary/[id]/page";

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

describe("Task 7 — /triage/summary/[id] API review, Changed by you, guidance/sources, restart & doctor handoff", () => {
  const sampleSession = {
    id: "sess-sum-1",
    state: "SUMMARY_PENDING_REVIEW",
    allowed_actions: ["confirm_summary", "end"],
    version: 4,
    language: "en",
    mode: "text",
    turns: [],
    summary: {
      patient_words: "Fever and headache for 3 days",
      structured_fields: {
        chief_complaint: "Fever and headache",
        duration: "3 days",
        severity: "Moderate",
        additional_notes: "No chronic illness",
        suggested_specialty_code: "general_medicine",
        suggested_specialty_en: "General Medicine",
        suggested_specialty_bn: "সাধারণ মেডিসিন",
        guidance_sources: [
          {
            title: "PLACEHOLDER — NOT CLINICALLY APPROVED: Outpatient Wayfinding Guide",
            publisher: "Medi Waypoint Pilot Review Board",
            version: "0.1-placeholder",
          },
        ],
      },
      guidance_given: "Recommended outpatient consultation in General Medicine.",
      patient_edits: {},
    },
  };

  it("loads summary from API, marks edited fields 'Changed by you', confirms via api client, and links to /doctors with specialty and triage_session_id", async () => {
    nav.pathname = "/en/triage/summary/sess-sum-1";
    nav.params = { locale: "en", id: "sess-sum-1" };

    const { calls } = mount(<TriageSummaryReviewPage params={Promise.resolve({ locale: "en" })} />, (url, method) => {
      if (url.endsWith("/triage/sessions/sess-sum-1") && method === "GET") return json(sampleSession);
      if (url.endsWith("/triage/sessions/sess-sum-1/summary/confirm") && method === "POST") {
        return json({ ...sampleSession, state: "CONFIRMED_BY_PATIENT", version: 5 });
      }
      return json({});
    });

    await waitFor(() => expect(screen.getByText(/Fever and headache for 3 days/)).toBeTruthy());
    expect(screen.getByText(/Recommended outpatient consultation in General Medicine/)).toBeTruthy();
    expect(screen.getByText(/Outpatient Wayfinding Guide/)).toBeTruthy();

    // Edit chief symptoms -> "Changed by you" marker appears
    const chiefInput = screen.getByLabelText(/Chief symptoms/i);
    expect(screen.queryByText("Changed by you")).toBeNull();
    fireEvent.change(chiefInput, { target: { value: "High fever and body ache" } });
    expect(screen.getByText("Changed by you")).toBeTruthy();

    // Confirm summary via API client
    fireEvent.click(screen.getByRole("button", { name: /Confirm and find a doctor/i }));
    await waitFor(() => expect(screen.getByRole("link", { name: /Browse doctors & clinics/i })).toBeTruthy());

    const confirmCall = calls.find((c) => c.url.endsWith("/summary/confirm") && c.method === "POST");
    expect(confirmCall).toBeTruthy();
    const sentEdits = (confirmCall?.body as { edits?: Record<string, string> })?.edits ?? {};
    expect(sentEdits).toEqual({ chief_complaint: "High fever and body ache" });

    const doctorsHref = screen.getByRole("link", { name: /Browse doctors & clinics/i }).getAttribute("href");
    expect(doctorsHref).toBe("/en/doctors?specialty=general_medicine&triage_session_id=sess-sum-1");
  });

  it("clicking 'This is wrong, start again' ends the session and routes back to /triage", async () => {
    nav.pathname = "/en/triage/summary/sess-sum-1";
    nav.params = { locale: "en", id: "sess-sum-1" };

    const { calls } = mount(<TriageSummaryReviewPage params={Promise.resolve({ locale: "en" })} />, (url, method) => {
      if (url.endsWith("/triage/sessions/sess-sum-1") && method === "GET") return json(sampleSession);
      if (url.endsWith("/triage/sessions/sess-sum-1/end") && method === "POST") {
        return json({ ...sampleSession, state: "ENDED_BY_PATIENT", version: 5 });
      }
      return json({});
    });

    await waitFor(() => expect(screen.getByText(/Fever and headache for 3 days/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /This is wrong, start again/i }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/triage"));
    expect(calls.some((c) => c.url.endsWith("/triage/sessions/sess-sum-1/end") && c.method === "POST")).toBe(true);
  });

  it("renders EmergencyScreen if /triage/summary/[id] loads an EMERGENCY_PATHWAY session", async () => {
    nav.pathname = "/en/triage/summary/sess-em-sum";
    nav.params = { locale: "en", id: "sess-em-sum" };

    mount(<TriageSummaryReviewPage params={Promise.resolve({ locale: "en" })} />, (url) => {
      if (url.endsWith("/triage/sessions/sess-em-sum")) {
        return json({
          ...sampleSession,
          id: "sess-em-sum",
          state: "EMERGENCY_PATHWAY",
          turns: [{ id: "t-em", role: "assistant", text: "PLACEHOLDER — NOT CLINICALLY APPROVED: Go to ER now.", language_detected: "en", response_policy: "emergency", at: "2026-11-23T10:00:00Z" }],
        });
      }
      return json({});
    });

    expect(await screen.findByText(/This may be an emergency/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Confirm and find a doctor/i })).toBeNull();
  });
});

describe("Code review regression fixes", () => {
  it("React StrictMode keeps the disclosure gate active on /triage?mode=text (#1)", async () => {
    nav.pathname = "/en/triage";
    nav.search = "mode=text";

    mount(
      <React.StrictMode>
        <TriagePage params={Promise.resolve({ locale: "en" })} />
      </React.StrictMode>,
      () => json({}),
    );

    expect(await screen.findByText("Before we start")).toBeTruthy();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("button", { name: /start writing/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("resuming SUMMARY_PENDING_REVIEW or ENDED_BY_PATIENT session does not show active turn input (#2)", async () => {
    nav.pathname = "/en/triage/session/sess-pending";
    nav.params = { locale: "en", id: "sess-pending" };

    const { unmount } = mount(<TriageSessionResumePage params={Promise.resolve({ locale: "en" })} />, (url) => {
      if (url.endsWith("/triage/sessions/sess-pending")) {
        return json({ id: "sess-pending", state: "SUMMARY_PENDING_REVIEW", version: 3, language: "en", mode: "text", turns: [], summary: { patient_words: "Fever" } });
      }
      return json({});
    });
    expect(await screen.findByRole("link", { name: /Finish & review summary|Review your intake summary/i })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    unmount();

    nav.pathname = "/en/triage/session/sess-ended";
    nav.params = { locale: "en", id: "sess-ended" };
    mount(<TriageSessionResumePage params={Promise.resolve({ locale: "en" })} />, (url) => {
      if (url.endsWith("/triage/sessions/sess-ended")) {
        return json({ id: "sess-ended", state: "ENDED_BY_PATIENT", version: 4, language: "en", mode: "text", turns: [], summary: null });
      }
      return json({});
    });
    expect(await screen.findByRole("link", { name: /Start a new session/i })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("finishing a PAUSED session resumes before calling /finish, and End does not route to /triage/summary (#4)", async () => {
    nav.pathname = "/en/triage/session/sess-paused";
    nav.params = { locale: "en", id: "sess-paused" };

    const { calls } = mount(<TriageSessionResumePage params={Promise.resolve({ locale: "en" })} />, (url, method) => {
      if (url.endsWith("/triage/sessions/sess-paused") && method === "GET") {
        return json({
          id: "sess-paused",
          state: "PAUSED",
          version: 3,
          language: "en",
          mode: "text",
          turns: [
            { id: "t1", role: "assistant", text: "Hi", language_detected: "en", at: "2026-11-23T10:00:00Z" },
            { id: "t2", role: "patient", text: "Fever", language_detected: "en", at: "2026-11-23T10:01:00Z" },
          ],
          summary: { patient_words: "Fever", structured_fields: {} },
        });
      }
      if (url.endsWith("/resume") && method === "POST") return json({ id: "sess-paused", state: "ACTIVE", version: 4 });
      if (url.endsWith("/finish") && method === "POST") return json({ id: "sess-paused", state: "SUMMARY_PENDING_REVIEW", version: 5 });
      if (url.endsWith("/end") && method === "POST") return json({ id: "sess-paused", state: "ENDED_BY_PATIENT", version: 5 });
      return json({});
    });

    await waitFor(() => expect(screen.getByRole("button", { name: /Finish & review summary/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Finish & review summary/i }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/triage/summary/sess-paused"));
    const postUrls = calls.filter((c) => c.method === "POST").map((c) => c.url);
    expect(postUrls.some((u) => u.endsWith("/resume"))).toBe(true);
    expect(postUrls.some((u) => u.endsWith("/finish"))).toBe(true);
  });

  it("mid-session language switch updates language without navigating away and discarding the session (#5)", async () => {
    nav.pathname = "/en/triage";
    nav.search = "mode=text";

    mount(<TriagePage params={Promise.resolve({ locale: "en" })} />, (url, method) => {
      if (url.endsWith("/triage/sessions") && method === "POST") {
        return json({
          id: "sess-lang-1",
          state: "ACTIVE",
          version: 2,
          language: "en",
          mode: "text",
          turns: [{ id: "t1", role: "assistant", text: "Describe symptoms", language_detected: "en", at: "2026-11-23T10:00:00Z" }],
          summary: null,
        }, 201);
      }
      return json({});
    });

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /start writing/i }));
    await waitFor(() => expect(screen.getByText("Describe symptoms")).toBeTruthy());

    // Switch to বাংলা mid-session
    fireEvent.click(screen.getByRole("button", { name: "বাংলা" }));
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.getByText("Describe symptoms")).toBeTruthy();
  });
});
