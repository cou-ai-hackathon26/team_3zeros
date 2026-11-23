import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const nav = { pathname: "/en/patients/p1", params: { id: "p1" } };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => nav.pathname,
  useParams: () => ({ locale: nav.pathname.split("/")[1], ...nav.params }),
}));

import { createApiClient } from "../api/client";
import { AppProviders, makeQueryClient } from "../api/queries/provider";
import { Toaster } from "../components/Toast/Toast";
import type { Chart, Patient, PatientResultsResponse, OrderCreateResponse } from "../api/queries/types";
import PatientChartPage from "./[locale]/(clinician)/patients/[id]/page";
import ReferralWorkspacePage from "./[locale]/(clinician)/referrals/[id]/page";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const err = (code: string, status: number) =>
  json({ error: { code, message: code, request_id: "req-err" } }, status);

type Route = (req: Request) => Response | Promise<Response>;

function mount(ui: React.ReactElement, routes: Record<string, Route>) {
  const calls: { key: string; body: string; headers: Headers }[] = [];
  const fetchImpl = async (req: Request) => {
    const u = new URL(req.url);
    const key = `${req.method} ${u.pathname.replace("/api/v1", "")}${u.search}`;
    calls.push({ key, body: await req.clone().text(), headers: new Headers(req.headers) });
    const handler = Object.entries(routes).find(
      ([k]) => key === k || key.startsWith(k + "?") || (k.endsWith("*") && key.startsWith(k.slice(0, -1)))
    );
    return handler ? handler[1](req) : err("not_found", 404);
  };
  const client = createApiClient({
    baseUrl: "http://localhost/api/v1",
    getCsrfToken: () => "csrf",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const view = render(
    <AppProviders client={client} queryClient={makeQueryClient()}>
      <Toaster>{ui}</Toaster>
    </AppProviders>
  );
  return { ...view, calls };
}

const page = (results: unknown[]) => json({ results, next_cursor: null });

const samplePatient: Patient = {
  id: "p1",
  given_name: "Anisur",
  family_name: "Rahman",
  name_bn: "আনিসুর রহমান",
  birth_date: "1978-05-12",
  sex: "male",
  phone: "+8801811223344",
  area_id: "area-1",
  identifiers: [{ id: "id-1", system: "NID", value: "19781234567890", verified: true }],
  version: 1,
};

const sampleChart: Chart = {
  patient_id: "p1",
  encounters: [
    {
      id: "enc-1",
      patient_id: "p1",
      facility_id: "fac-1",
      facility_name: "Dhanmondi Specialist Chamber",
      period_start: "2026-11-20T10:00:00Z",
      encounter_type: "outpatient",
      reason: "Hypertension review",
      observations: [
        { id: "obs-1", code: "8867-4", display_name: "Pulse", value_numeric: 76, unit: "bpm" },
      ],
    },
  ],
  active_allergies: [
    { id: "alg-1", name: "Penicillin", reaction: "Anaphylaxis and acute urticaria" },
  ],
  active_medications: [
    { id: "med-1", name: "Amlodipine", dosage: "5 mg once daily" },
  ],
  active_problems: [
    { encounter_id: "enc-1", reason: "Essential Hypertension", period_start: "2026-11-20T10:00:00Z" },
  ],
};

const sampleResults: PatientResultsResponse = {
  patient_id: "p1",
  results: [
    {
      id: "res-1",
      code: "2160-0",
      display_name: "Serum Creatinine",
      value: "1.1",
      unit: "mg/dL",
      observed_date: "2026-11-15T09:30:00Z",
      lab: "Popular Diagnostic",
      verified: true,
    },
    {
      id: "res-2",
      code: "2160-0",
      display_name: "Serum Creatinine",
      value: "1.3",
      unit: "mg/dL",
      observed_date: "2026-09-10T11:00:00Z",
      lab: "Ibn Sina Diagnostic",
      verified: true,
    },
  ],
  timeline: [
    {
      test_name: "Serum Creatinine",
      code: "2160-0",
      results: [
        {
          id: "res-1",
          code: "2160-0",
          display_name: "Serum Creatinine",
          value: "1.1",
          unit: "mg/dL",
          observed_date: "2026-11-15T09:30:00Z",
          lab: "Popular Diagnostic",
          verified: true,
        },
        {
          id: "res-2",
          code: "2160-0",
          display_name: "Serum Creatinine",
          value: "1.3",
          unit: "mg/dL",
          observed_date: "2026-09-10T11:00:00Z",
          lab: "Ibn Sina Diagnostic",
          verified: true,
        },
      ],
    },
  ],
};

describe("Phase D — Record Continuity Frontend", () => {
  beforeEach(() => {
    nav.pathname = "/en/patients/p1";
    nav.params = { id: "p1" };
  });

  it("renders active allergies, medications and problems on patient chart summary", async () => {
    mount(<PatientChartPage />, {
      "GET /patients/p1": () => json(samplePatient),
      "GET /patients/p1/chart": () => json(sampleChart),
      "GET /patients/p1/results*": () => json(sampleResults),
      "GET /referrals*": () => page([]),
      "GET /patients/p1/duplicate-candidates": () => json([]),
      "GET /auth/me": () => json({ roles: ["clinician"], active_facility: { id: "fac-1", name: "Clinic" } }),
    });

    expect(await screen.findByText("Anisur Rahman")).toBeTruthy();
    expect(await screen.findByText(/Penicillin/)).toBeTruthy();
    expect(screen.getByText("Anaphylaxis and acute urticaria")).toBeTruthy();
    expect(screen.getByText(/Amlodipine/)).toBeTruthy();
    expect(screen.getByText("5 mg once daily")).toBeTruthy();
    expect(screen.getByText(/Essential Hypertension/)).toBeTruthy();
  });

  it("renders chronological results timeline grouped by test", async () => {
    mount(<PatientChartPage />, {
      "GET /patients/p1": () => json(samplePatient),
      "GET /patients/p1/chart": () => json(sampleChart),
      "GET /patients/p1/results*": () => json(sampleResults),
      "GET /referrals*": () => page([]),
      "GET /patients/p1/duplicate-candidates": () => json([]),
      "GET /auth/me": () => json({ roles: ["clinician"], active_facility: { id: "fac-1", name: "Clinic" } }),
    });

    expect(await screen.findByText("Anisur Rahman")).toBeTruthy();
    const resultsTab = screen.getByRole("tab", { name: "Results" });
    fireEvent.mouseDown(resultsTab);
    fireEvent.click(resultsTab);

    expect(await screen.findByText("Investigation Timeline")).toBeTruthy();
    expect(screen.getByText("Serum Creatinine")).toBeTruthy();
    expect(screen.getByText("Popular Diagnostic")).toBeTruthy();
    expect(screen.getByText("Ibn Sina Diagnostic")).toBeTruthy();
    expect(screen.getAllByText("Verified").length).toBeGreaterThanOrEqual(1);
  });

  it("orders a diagnostic test and shows recent results duplicate advisory (INV-15)", async () => {
    const advisoryOrderResponse: OrderCreateResponse = {
      order: {
        id: "ord-1",
        encounter_id: "enc-1",
        patient_id: "p1",
        test_name: "Serum Creatinine",
        code: "2160-0",
        notes: "Routine pre-op",
        priority: "ROUTINE",
        status: "PLACED",
        ordered_by_name: "Dr. Doctor",
        created_at: "2026-11-23T15:00:00Z",
      },
      recent_results: [
        {
          id: "res-1",
          test_name: "Serum Creatinine",
          code: "2160-0",
          value: "1.1 mg/dL",
          unit: "mg/dL",
          observed_date: "2026-11-15T09:30:00Z",
          days_ago: 8,
          facility_name: "Popular Diagnostic",
          verified: true,
        },
      ],
      advisory: "Recent result available: Serum Creatinine was performed 8 day(s) ago at Popular Diagnostic (Result: 1.1 mg/dL). Test ordered as requested; duplicate tests are never cancelled automatically (INV-15).",
    };

    const { calls } = mount(<PatientChartPage />, {
      "GET /patients/p1": () => json(samplePatient),
      "GET /patients/p1/chart": () => json(sampleChart),
      "GET /patients/p1/results*": () => json(sampleResults),
      "POST /encounters/enc-1/orders": () => json(advisoryOrderResponse, 201),
      "GET /referrals*": () => page([]),
      "GET /patients/p1/duplicate-candidates": () => json([]),
      "GET /auth/me": () => json({ roles: ["clinician"], active_facility: { id: "fac-1", name: "Clinic" } }),
    });

    expect(await screen.findByText("Anisur Rahman")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Order test" }));
    });

    const dialog = await screen.findByRole("dialog", { name: "Order diagnostic investigation" });
    expect(dialog).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^Test name/), {
      target: { value: "Serum Creatinine" },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Order test" }));
    });

    await waitFor(() => expect(calls.some((c) => c.key === "POST /encounters/enc-1/orders")).toBe(true));

    // Must show the recent-results advisory banner without cancelling the order (INV-15)
    expect(await screen.findByText("Recent Results Available (INV-15)")).toBeTruthy();
    expect(screen.getByText(/was performed 8 day\(s\) ago/)).toBeTruthy();
  });

  it("reconciles active medications and allergies into referral draft", async () => {
    nav.pathname = "/en/referrals/ref-1";
    nav.params = { id: "ref-1" };

    const sampleReferral = {
      id: "ref-1",
      patient_id: "p1",
      patient_name: "Anisur Rahman",
      sender_facility_name: "Local Clinic",
      receiver_facility_name: "Tertiary Hospital",
      urgency: "urgent",
      state: "DRAFT",
      reason: "Patient needs specialized nephrology consultation",
      summary: { sections: [] },
      version: 1,
      reference_code: "REF12345",
      allowed_actions: ["request_consent", "cancel"],
      history: [],
      consent_state: "consented",
    };

    mount(<ReferralWorkspacePage />, {
      "GET /referrals/ref-1": () => json(sampleReferral),
      "GET /patients/p1/chart": () => json(sampleChart),
      "GET /auth/me": () => json({ roles: ["clinician"], active_facility: { id: "fac-1", name: "Clinic" } }),
    });

    expect(await screen.findByText("Medication & allergy reconciliation")).toBeTruthy();
    expect(screen.getByText("Penicillin")).toBeTruthy();
    expect(screen.getByText("Amlodipine 5 mg once daily")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Include in referral" }));
    });

    const textarea = screen.getByLabelText(/^Reason/) as HTMLTextAreaElement;
    expect(textarea.value).toContain("Allergies: Penicillin");
    expect(textarea.value).toContain("Medications: Amlodipine");
  });

  it("opens patient-held printable summary layout", async () => {
    mount(<PatientChartPage />, {
      "GET /patients/p1": () => json(samplePatient),
      "GET /patients/p1/chart": () => json(sampleChart),
      "GET /patients/p1/results*": () => json(sampleResults),
      "GET /referrals*": () => page([]),
      "GET /patients/p1/duplicate-candidates": () => json([]),
      "GET /auth/me": () => json({ roles: ["clinician"], active_facility: { id: "fac-1", name: "Clinic" } }),
    });

    expect(await screen.findByText("Anisur Rahman")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Print record" }));
    });

    expect((await screen.findAllByText("Patient-Held Health Summary")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Authorized Clinician Signature / Stamp")).toBeTruthy();
    expect(screen.getByText("Official patient-held summary. All prior investigations verified.")).toBeTruthy();
  });
});
