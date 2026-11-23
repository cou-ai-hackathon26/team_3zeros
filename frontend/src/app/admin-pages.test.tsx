import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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
import type { AccessRequestItem } from "../api/queries/types";
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

  describe("/staff (MASTERPLAN D-16, D-17)", () => {
    beforeEach(() => { nav.pathname = "/en/staff"; });
    const ME = (roles: string[]) => ({ id: "me-1", email: "fa@example.org", phone: null, display_name: "Admin", preferred_language: "en", roles, permissions: [], active_facility: { id: "fac-1", name: "Tangail" }, is_platform_admin: roles.includes("platform_admin") });
    const row = (o: Record<string, unknown> = {}) => ({ id: "mem-1", user_id: "u-1", name: "Farhana Akter", email: "farhana@example.org", username: null, facility_id: "fac-1", facility_name: "Tangail", role: "facility_staff", permissions: ["emergency.create", "referral.acknowledge"], active: true, mfa_enabled: false, active_from: "2026-01-01T00:00:00Z", active_to: null, ...o });
    const CAT = [{ code: "schedule.manage", description: "x" }, { code: "referral.acknowledge", description: "x" }, { code: "referral.create", description: "x" }, { code: "emergency.create", description: "x" }];
    const routes = (rows: unknown[], roles = ["facility_admin"], extra: Record<string, Route> = {}) => ({
      "GET /auth/me": () => json(ME(roles)),
      "GET /admin/staff": () => page(rows),
      "GET /admin/permissions": () => page(CAT),
      "GET /admin/facilities": () => page([{ id: "fac-1", name: "Tangail" }]),
      "GET /admin/access-requests": () => page([]),
      ...extra,
    });
    const click = async (name: string | RegExp) => { await act(async () => { fireEvent.click(await screen.findByRole("button", { name })); }); };
    const clickTab = async (name: string | RegExp) => { await act(async () => { fireEvent.click(await screen.findByRole("tab", { name })); }); };

    it("lists staff with readable permission names, role and status, and offers no actions on your own row", async () => {
      mount(<AdminStaffPage />, routes([row(), row({ id: "mem-me", user_id: "me-1", name: "Admin Self", role: "facility_admin", permissions: [] })]));
      expect(await screen.findByText("Farhana Akter")).toBeTruthy();
      expect(screen.getByText("Facility staff")).toBeTruthy();
      expect(screen.getByRole("columnheader", { name: "Facility" })).toBeTruthy();
      expect(screen.getAllByText("Tangail").length).toBeGreaterThan(0);
      expect(document.body.textContent).toContain("Acknowledge or decline incoming referrals");
      expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
      expect(screen.queryByText("Revoked")).toBeNull();
      expect(screen.getByText("You cannot change your own access here.")).toBeTruthy();
      expect(screen.getAllByRole("button", { name: "Edit access" })).toHaveLength(1);
    });

    it("creating an account posts once, shows the temporary password once, and never shows it again", async () => {
      const { calls } = mount(<AdminStaffPage />, routes([], ["facility_admin"], { "POST /admin/staff": () => json(row({ id: "n1", name: "New Person", email: "new@example.org", temporary_password: "Xk3-temp-9pQ" }), 201) }));
      await click("Add staff member");
      fireEvent.change(await screen.findByLabelText(/^Name\(required/), { target: { value: "New Person" } });
      fireEvent.change(screen.getByLabelText(/Email or username/), { target: { value: "new@example.org" } });
      fireEvent.click(screen.getByRole("checkbox", { name: "Decide appointment requests and manage the schedule" }));
      await click("Create account");
      expect(await screen.findByText("Xk3-temp-9pQ")).toBeTruthy();
      expect(screen.getByText("Save these now")).toBeTruthy();
      const post = calls.find((c) => c.key === "POST /admin/staff")!;
      expect(JSON.parse(post.body)).toEqual({ display_name: "New Person", email: "new@example.org", role: "facility_staff", facility_id: "fac-1", permissions: ["schedule.manage"] });
      expect(post.headers.get("Idempotency-Key")).toBeTruthy();
      await click("Done");
      await waitFor(() => expect(document.body.textContent).not.toContain("Xk3-temp-9pQ"));
    });

    it("a clinician needs a registration number, and a facility admin cannot grant the admin role while a platform admin can", async () => {
      const { unmount } = mount(<AdminStaffPage />, routes([], ["facility_admin"]));
      await click("Add staff member");
      await screen.findByLabelText(/Email or username/);
      expect(screen.queryByRole("option", { name: "Facility admin" })).toBeNull();
      fireEvent.change(screen.getByRole("combobox", { name: /Role/ }), { target: { value: "clinician" } });
      expect(await screen.findByLabelText(/BMDC registration number/)).toBeTruthy();
      unmount();
      mount(<AdminStaffPage />, routes([], ["platform_admin"]));
      await click("Add staff member");
      expect(await screen.findByRole("option", { name: "Facility admin" })).toBeTruthy();
    });

    it("deactivating asks first, then posts; an inactive person can be reactivated", async () => {
      const { calls } = mount(<AdminStaffPage />, routes([row(), row({ id: "mem-2", name: "Old Hand", active: false })], ["facility_admin"], {
        "POST /admin/staff/mem-1/deactivate": () => json(row({ active: false })),
        "POST /admin/staff/mem-2/reactivate": () => json(row({ id: "mem-2" })),
      }));
      await screen.findByText("Farhana Akter");
      expect(screen.getByText("Deactivated")).toBeTruthy(); // the inactive row says so in words
      await click("Deactivate");
      const dialog = await screen.findByRole("alertdialog", { name: "Deactivate Farhana Akter?" });
      expect(calls.some((c) => c.key.endsWith("/deactivate"))).toBe(false);
      await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate" })); });
      await waitFor(() => expect(calls.some((c) => c.key === "POST /admin/staff/mem-1/deactivate")).toBe(true));
      await click("Reactivate");
      await waitFor(() => expect(calls.some((c) => c.key === "POST /admin/staff/mem-2/reactivate")).toBe(true));
    });

    it("resetting a password confirms, then shows the new one once", async () => {
      mount(<AdminStaffPage />, routes([row()], ["facility_admin"], { "POST /admin/staff/mem-1/reset-password": () => json({ temporary_password: "New-temp-77aB" }) }));
      await screen.findByText("Farhana Akter");
      await click("Reset password");
      await act(async () => { fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reset password" })); });
      expect(await screen.findByText("New-temp-77aB")).toBeTruthy();
    });

    it("editing sends the chosen permissions; a refusal from the server is shown, not hidden", async () => {
      const { calls } = mount(<AdminStaffPage />, routes([row()], ["facility_admin"], { "PATCH /admin/staff/mem-1": () => json({ error: { code: "permission_denied", message: "Only a platform admin can change an admin.", request_id: "r" } }, 403) }));
      await screen.findByText("Farhana Akter");
      await click("Edit access");
      fireEvent.click(await screen.findByRole("checkbox", { name: "Create outgoing referrals" }));
      await click("Save");
      await waitFor(() => expect(calls.some((c) => c.key === "PATCH /admin/staff/mem-1")).toBe(true));
      expect(JSON.parse(calls.find((c) => c.key === "PATCH /admin/staff/mem-1")!.body).permissions).toContain("referral.create");
      expect((await screen.findAllByText("Only a platform admin can change an admin.")).length).toBeGreaterThan(0);
    });

    it("empty and error states", async () => {
      const { unmount } = mount(<AdminStaffPage />, routes([]));
      expect(await screen.findByText("No staff memberships found.")).toBeTruthy();
      unmount();
      mount(<AdminStaffPage />, { ...routes([]), "GET /admin/staff": () => err("not_found", 404) });
      expect(await screen.findByText("Failed to load staff accounts.")).toBeTruthy();
    });

    it("switches to access requests tab, displays pending requests, and approves with secrets", async () => {
      const reqItem: AccessRequestItem = {
        id: "req-1",
        name: "Dr. Rafiqul Islam",
        contact: "+8801711000000",
        facility_id: null,
        facility_name: null,
        facility_name_bn: null,
        chamber_name: "Rafiq Care",
        chamber_name_bn: "রফিক কেয়ার",
        bmdc_registration_number: "A-54321",
        status: "PENDING",
        rejection_reason: null,
        created_at: "2026-11-23T10:00:00Z",
        reviewed_at: null,
      };
      const { calls } = mount(
        <AdminStaffPage />,
        routes([], ["platform_admin"], {
          "GET /admin/access-requests": () => page([reqItem]),
          "POST /admin/access-requests/req-1/approve": () =>
            json({ status: "APPROVED", facility_id: "fac-new-1", reference: "AR-2026-0001", details: { temporary_password: "Chamber-temp-123" } }),
        })
      );
      await clickTab(/Access requests/);
      expect(await screen.findByText("Dr. Rafiqul Islam")).toBeTruthy();
      expect(screen.getByText("A-54321")).toBeTruthy();
      expect(screen.getByText("Rafiq Care")).toBeTruthy();
      expect(screen.getByText("Private chamber")).toBeTruthy();
      expect(screen.getByText("Pending")).toBeTruthy();

      await click("Approve");
      expect(await screen.findByText("Chamber-temp-123")).toBeTruthy();
      expect(calls.some((c) => c.key === "POST /admin/access-requests/req-1/approve")).toBe(true);
      await click("Done");
    });

    it("allows declining an access request with a reason", async () => {
      const reqItem: AccessRequestItem = {
        id: "req-2",
        name: "Dr. Hasan",
        contact: "+8801711000001",
        facility_id: "fac-1",
        facility_name: "Tangail",
        facility_name_bn: "টাঙ্গাইল",
        chamber_name: null,
        chamber_name_bn: null,
        bmdc_registration_number: "A-99999",
        status: "PENDING",
        rejection_reason: null,
        created_at: "2026-11-23T10:00:00Z",
        reviewed_at: null,
      };
      const { calls } = mount(
        <AdminStaffPage />,
        routes([], ["facility_admin"], {
          "GET /admin/access-requests": () => page([reqItem]),
          "POST /admin/access-requests/req-2/reject": () =>
            json({ status: "REJECTED", reference: "AR-2026-0002", reason: "Invalid BMDC" }),
        })
      );
      await clickTab(/Access requests/);
      expect(await screen.findByText("Dr. Hasan")).toBeTruthy();
      await click("Decline");

      expect(await screen.findByRole("heading", { name: "Decline request from Dr. Hasan?" })).toBeTruthy();
      fireEvent.change(screen.getByLabelText(/Reason for declining/), { target: { value: "Invalid BMDC" } });
      await click("Decline");

      await waitFor(() => expect(calls.some((c) => c.key === "POST /admin/access-requests/req-2/reject")).toBe(true));
      const post = calls.find((c) => c.key === "POST /admin/access-requests/req-2/reject")!;
      expect(JSON.parse(post.body)).toEqual({ reason: "Invalid BMDC" });
    });
  });
});
