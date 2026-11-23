import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const nav = { pathname: "/en/facility", params: {} as Record<string, string> };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => nav.pathname,
  useParams: () => ({ locale: nav.pathname.split("/")[1], ...nav.params }),
}));

import { createApiClient } from "../api/client";
import { AppProviders, makeQueryClient } from "../api/queries/provider";
import { Toaster } from "../components/Toast/Toast";
import AdminFacilityPage from "./[locale]/(admin)/facility/page";
import AdminSchedulesPage from "./[locale]/(admin)/schedules/page";
import AdminCapacityPage from "./[locale]/(admin)/capacity/page";
import AdminStaffPage from "./[locale]/(admin)/staff/page";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const err = (code: string, status: number) =>
  json({ error: { code, message: code, request_id: "req-admin-err" } }, status);

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

beforeEach(() => {
  nav.pathname = "/en/facility";
  nav.params = {};
});

describe("Phase 7 — Admin screens (G-5)", () => {
  describe("/facility", () => {
    it("renders empty state when no facilities exist", async () => {
      mount(<AdminFacilityPage />, {
        "GET /admin/facilities": () => page([]),
      });
      expect(await screen.findByText("Facility directory")).toBeTruthy();
      expect(await screen.findByText("No facilities found.")).toBeTruthy();
    });

    it("renders table of facilities when data is returned", async () => {
      mount(<AdminFacilityPage />, {
        "GET /admin/facilities": () =>
          page([
            {
              id: "fac-1",
              name: "Tangail District Hospital",
              name_bn: "টাঙ্গাইল জেলা হাসপাতাল",
              type: "district_hospital",
              phone: "01700000000",
              address: "Hospital Road, Tangail",
            },
          ]),
      });
      expect(await screen.findByText("Tangail District Hospital")).toBeTruthy();
      expect(screen.getByText("টাঙ্গাইল জেলা হাসপাতাল")).toBeTruthy();
      expect(screen.getByText("district hospital")).toBeTruthy();
      expect(screen.getByText("01700000000")).toBeTruthy();
    });

    it("renders retryable error state on failure", async () => {
      mount(<AdminFacilityPage />, {
        "GET /admin/facilities": () => err("server_error", 400),
      });
      expect(await screen.findByText("Failed to load facility directory.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    });
  });

  describe("/schedules", () => {
    beforeEach(() => {
      nav.pathname = "/en/schedules";
    });

    it("renders empty state when no schedules exist", async () => {
      mount(<AdminSchedulesPage />, {
        "GET /admin/schedules": () => page([]),
      });
      expect(await screen.findByText("Practitioner schedules")).toBeTruthy();
      expect(await screen.findByText("No schedules configured for this facility.")).toBeTruthy();
    });

    it("renders schedules table with practitioner, specialty and slots count", async () => {
      mount(<AdminSchedulesPage />, {
        "GET /admin/schedules": () =>
          page([
            {
              id: "sch-1",
              practitioner_id: "pr-1",
              practitioner_name: "Dr. Rahima Khatun",
              specialty: "Medicine",
              facility_id: "fac-1",
              facility_name: "Tangail District Hospital",
              slots_count: 16,
              recurrence_rules: { days: ["Thursday"] },
            },
          ]),
      });
      expect(await screen.findByText("Dr. Rahima Khatun")).toBeTruthy();
      expect(screen.getByText("Medicine")).toBeTruthy();
      expect(screen.getByText("16")).toBeTruthy();
    });
  });

  describe("/capacity (INV-14)", () => {
    beforeEach(() => {
      nav.pathname = "/en/capacity";
    });

    it("displays mandatory INV-14 notice that capacity is never shown as live", async () => {
      mount(<AdminCapacityPage />, {
        "GET /admin/capacity-reports": () => page([]),
      });
      expect(await screen.findByText("Capacity reports")).toBeTruthy();
      expect(
        screen.getByText(
          "Capacity data always displays its timestamp and reporting source. It is never shown as live (INV-14)."
        )
      ).toBeTruthy();
      expect(await screen.findByText("No capacity reports found for this facility.")).toBeTruthy();
    });

    it("renders capacity reports table", async () => {
      mount(<AdminCapacityPage />, {
        "GET /admin/capacity-reports": () =>
          page([
            {
              id: "cap-1",
              facility: "fac-1",
              facility_name: "Tangail District Hospital",
              reported_at: "2026-11-23T08:30:00Z",
              general_medicine_beds: 6,
            },
          ]),
      });
      expect(await screen.findByText("Tangail District Hospital")).toBeTruthy();
      expect(screen.getByText("General Medicine beds: 6")).toBeTruthy();
    });
  });

  describe("/staff", () => {
    beforeEach(() => {
      nav.pathname = "/en/staff";
    });

    it("renders staff members table with permissions and roles", async () => {
      mount(<AdminStaffPage />, {
        "GET /admin/staff": () =>
          page([
            {
              id: "mem-1",
              user_id: "u-1",
              name: "Farhana Akter",
              email: "farhana@tangail.gov.bd",
              phone: "01711111111",
              facility_id: "fac-1",
              facility_name: "Tangail District Hospital",
              role: "facility_staff",
              permissions: ["emergency.create", "referral.acknowledge"],
              active_from: "2026-01-01T00:00:00Z",
              active_to: null,
            },
          ]),
      });
      expect(await screen.findByText("Farhana Akter")).toBeTruthy();
      expect(screen.getByText("Facility staff")).toBeTruthy();
      expect(screen.getByText("01711111111")).toBeTruthy();
      expect(screen.getByText("emergency.create, referral.acknowledge")).toBeTruthy();
    });
  });
});
