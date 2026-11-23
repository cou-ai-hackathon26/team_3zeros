import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const nav = { pathname: "/en/ed", params: {} as Record<string, string> };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => nav.pathname,
  useParams: () => ({ locale: nav.pathname.split("/")[1], ...nav.params }),
}));

import { createApiClient } from "../api/client";
import { AppProviders, makeQueryClient } from "../api/queries/provider";
import { Toaster } from "../components/Toast/Toast";
import type { EDVisitItem } from "../api/queries/types";
import EDQueuePage from "./[locale]/(clinician)/ed/page";
import EDVisitDetailPage from "./[locale]/(clinician)/ed/[id]/page";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const err = (code: string, status: number) =>
  json({ error: { code, message: code, request_id: "req-ed-err" } }, status);

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

const sampleVisit: EDVisitItem = {
  id: "ed-1",
  facility_id: "fac-1",
  facility_name: "Dhaka Medical College Hospital",
  facility_name_bn: "ঢাকা মেডিকেল কলেজ হাসপাতাল",
  patient_id: "pat-1",
  patient_name: "Karim Uddin",
  patient_name_bn: "করিম উদ্দিন",
  patient_phone: "+8801711000000",
  patient_sex: "male",
  encounter_id: "enc-1",
  state: "ARRIVED",
  triage_category: null,
  chief_complaint: "Severe acute chest pain",
  arrival_mode: "AMBULANCE",
  arrived_at: "2026-11-23T14:00:00Z",
  triaged_at: null,
  triaged_by_name: null,
  disposition_at: null,
  disposition_notes: "",
  discharge_summary: "",
  transfer_facility_id: null,
  transfer_facility_name: null,
  observations: [
    { code: "8867-4", display_name: "Heart rate", value_numeric: 110, unit: "bpm" },
    { code: "2708-6", display_name: "Oxygen saturation (SpO2)", value_numeric: 93, unit: "%" },
  ],
  version: 1,
  allowed_actions: ["triage", "start_care", "transfer", "mark_left", "mark_died"],
  created_at: "2026-11-23T14:00:00Z",
};

describe("Phase C — Emergency Department Frontend", () => {
  beforeEach(() => {
    nav.pathname = "/en/ed";
    nav.params = {};
  });

  describe("ED Queue Board", () => {
    it("renders active arrivals with patient details and chief complaint", async () => {
      mount(<EDQueuePage />, {
        "GET /ed-visits*": () => page([sampleVisit]),
        "GET /directory/facilities*": () => page([]),
      });

      expect(await screen.findByText("Emergency Department")).toBeTruthy();
      expect(await screen.findByText("Karim Uddin")).toBeTruthy();
      expect(screen.getByText("Severe acute chest pain")).toBeTruthy();
      expect(screen.getByText("Ambulance")).toBeTruthy();
      expect(screen.getAllByText("Arrived").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole("link", { name: "Open visit" })).toBeTruthy();
    });

    it("registers a new arrival via fast intake modal", async () => {
      const { calls } = mount(<EDQueuePage />, {
        "GET /ed-visits*": () => page([]),
        "GET /directory/facilities*": () => page([]),
        "POST /ed-visits": () => json(sampleVisit, 201),
      });

      expect(await screen.findByText("No emergency arrivals found.")).toBeTruthy();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Register arrival/ }));
      });

      const dialog = await screen.findByRole("dialog", { name: "Emergency Department Intake" });
      expect(dialog).toBeTruthy();
      fireEvent.change(screen.getByLabelText(/^Chief complaint/), {
        target: { value: "Sudden acute dyspnea" },
      });
      fireEvent.change(screen.getByLabelText(/^Heart rate/), {
        target: { value: "125" },
      });

      await act(async () => {
        fireEvent.click(within(dialog).getByRole("button", { name: "Register arrival" }));
      });

      await waitFor(() => expect(calls.some((c) => c.key === "POST /ed-visits")).toBe(true));
      const post = calls.find((c) => c.key === "POST /ed-visits")!;
      const parsed = JSON.parse(post.body);
      expect(parsed.chief_complaint).toBe("Sudden acute dyspnea");
      expect(parsed.vitals.pulse).toBe("125");
    });
  });

  describe("ED Visit Detail", () => {
    beforeEach(() => {
      nav.pathname = "/en/ed/ed-1";
      nav.params = { id: "ed-1" };
    });

    it("renders visit details, observations and allowed actions", async () => {
      mount(<EDVisitDetailPage />, {
        "GET /ed-visits/ed-1": () => json(sampleVisit),
        "GET /directory/facilities*": () => page([]),
      });

      expect(await screen.findByText("Karim Uddin")).toBeTruthy();
      expect(screen.getByText("Severe acute chest pain")).toBeTruthy();
      expect(screen.getByText("Heart rate")).toBeTruthy();
      expect(screen.getByText("bpm")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Triage" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Start care" })).toBeTruthy();
    });

    it("executes triage action with category", async () => {
      const triagedVisit = {
        ...sampleVisit,
        state: "TRIAGED",
        triage_category: "RED",
        allowed_actions: ["start_care", "admit", "discharge", "transfer"],
      };

      const { calls } = mount(<EDVisitDetailPage />, {
        "GET /ed-visits/ed-1": () => json(sampleVisit),
        "POST /ed-visits/ed-1/actions/triage": () => json(triagedVisit),
        "GET /directory/facilities*": () => page([]),
      });

      const triageBtn = await screen.findByRole("button", { name: "Triage" });
      await act(async () => {
        fireEvent.click(triageBtn);
      });

      const dialog = await screen.findByRole("dialog", { name: "Triage assessment" });
      expect(dialog).toBeTruthy();
      fireEvent.change(screen.getByLabelText(/Triage category/), {
        target: { value: "RED" },
      });

      await act(async () => {
        fireEvent.click(within(dialog).getByRole("button", { name: "Triage" }));
      });

      await waitFor(() =>
        expect(calls.some((c) => c.key === "POST /ed-visits/ed-1/actions/triage")).toBe(true)
      );
      const post = calls.find((c) => c.key === "POST /ed-visits/ed-1/actions/triage")!;
      expect(JSON.parse(post.body).category).toBe("RED");
    });
  });
});

