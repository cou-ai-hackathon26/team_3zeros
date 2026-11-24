import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const pushMock = vi.fn();
const nav = { pathname: "/en/referrals/incoming", params: {} as Record<string, string> };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => nav.pathname,
  useParams: () => ({ locale: "en", ...nav.params }),
}));

import { createApiClient } from "../../../api/client";
import { AppProviders, makeQueryClient } from "../../../api/queries/provider";
import { Toaster } from "../../Toast/Toast";
import { ReferralsIndex } from "../../clinical/ReferralsIndex";
import ReferralWorkspacePage from "../../../app/[locale]/(clinician)/referrals/[id]/page";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const RECV_DOC = {
  id: "doc-recv-1",
  email: null,
  phone: null,
  display_name: "Dr. Tangail",
  preferred_language: "en",
  roles: ["clinician"],
  permissions: ["referral.acknowledge", "referral.create"],
  active_facility: { id: "fac-dh-1", name: "Tangail District Hospital" },
  is_platform_admin: false,
};

function mount(
  ui: React.ReactElement,
  routes: Record<string, (req: Request) => Response | Promise<Response>>
) {
  const calls: Array<{ method: string; path: string; body: string }> = [];
  const fetchImpl = async (req: Request) => {
    const u = new URL(req.url);
    const path = u.pathname.replace("/api/v1", "");
    const key = `${req.method} ${path}${u.search}`;
    calls.push({ method: req.method, path, body: await req.clone().text() });
    const hit = Object.entries(routes).find(
      ([k]) => key === k || key.startsWith(k + "?") || key.startsWith(k + "&") || `${req.method} ${path}` === k
    );
    return hit ? hit[1](req) : json({ error: { code: "not_found", message: "not_found" } }, 404);
  };
  const client = createApiClient({
    baseUrl: "http://localhost/api/v1",
    getCsrfToken: () => "csrf-mvp",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const view = render(
    <AppProviders client={client} queryClient={makeQueryClient()}>
      <Toaster>{ui}</Toaster>
    </AppProviders>
  );
  return { ...view, calls };
}

describe("MVP Receiving Facility — Partial Intake & Reconciliation UI", () => {
  beforeEach(() => {
    pushMock.mockReset();
    nav.pathname = "/en/referrals/incoming";
    nav.params = {};
  });

  it("offers Accept partial referral on 404 slip lookup, strips MW-REF: prefix, posts partial-intake, and navigates to workspace", async () => {
    const { calls } = mount(<ReferralsIndex initial="incoming" />, {
      "GET /auth/me": () => json(RECV_DOC),
      "GET /referrals/?direction=incoming": () => json({ results: [], next_cursor: null }),
      "GET /referrals/by-reference/MW-REF%3AUHC01-1124-0777": () =>
        json({ error: { code: "not_found", message: "Not found" } }, 404),
      "POST /referrals/partial-intake": () =>
        json({ id: "ref-partial-777", reference_code: "REF-2026-0777", is_partial: true }, 201),
    });

    await waitFor(() => expect(screen.getByLabelText(/find by slip code/i)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/find by slip code/i), {
      target: { value: "MW-REF:UHC01-1124-0777" },
    });
    fireEvent.click(screen.getByRole("button", { name: /find/i }));

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    // Click Accept partial referral button offered in lookup 404 status
    const acceptButtons = screen.getAllByRole("button", { name: /accept partial referral/i });
    fireEvent.click(acceptButtons[acceptButtons.length - 1]);

    await waitFor(() => expect(screen.getByTestId("partial-referral-intake-panel")).toBeTruthy());
    const panel = screen.getByTestId("partial-referral-intake-panel");
    fireEvent.change(within(panel).getByLabelText(/reason for referral/i), {
      target: { value: "Severe pre-eclampsia" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: /^accept partial referral$/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/en/referrals/ref-partial-777"));
    const post = calls.find((c) => c.method === "POST" && c.path === "/referrals/partial-intake")!;
    expect(JSON.parse(post.body)).toMatchObject({
      provisional_code: "UHC01-1124-0777",
      reason: "Severe pre-eclampsia",
    });
  });

  it("renders Partial Record banner with missing_fields, then Reconciled banner once sender syncs", async () => {
    nav.pathname = "/en/referrals/ref-partial-777";
    nav.params = { id: "ref-partial-777" };

    const baseRef = {
      id: "ref-partial-777",
      reference_code: "REF-2026-0777",
      provisional_code: "UHC01-1124-0777",
      state: "IN_PROGRESS",
      urgency: "urgent",
      emergency_mode: false,
      reason: "Severe pre-eclampsia",
      patient_id: "pat-1",
      patient_name: "Rahima",
      patient_system_id: "MWP-77889900",
      sender_facility_id: null,
      sender_facility_name: null,
      receiver_facility_id: "fac-dh-1",
      receiver_facility_name: "Tangail District Hospital",
      summary: {},
      consent_state: "not_requested",
      allowed_actions: ["record_outcome"],
      version: 3,
      history: [],
      created_at: "2026-11-24T04:00:00Z",
      updated_at: "2026-11-24T04:15:00Z",
    };

    const { unmount } = mount(<ReferralWorkspacePage />, {
      "GET /auth/me": () => json(RECV_DOC),
      "GET /referrals/ref-partial-777": () =>
        json({
          ...baseRef,
          is_partial: true,
          completeness_status: "PARTIAL",
          missing_fields: ["sender_facility", "clinical_summary", "consent_record"],
          reconciled_at: null,
        }),
      "GET /patients/pat-1/chart": () => json({ active_medications: [], active_allergies: [] }),
    });

    await waitFor(() => expect(screen.getByTestId("partial-record-banner")).toBeTruthy());
    expect(screen.getByTestId("partial-record-banner").textContent).toContain("sender_facility");
    expect(screen.getByTestId("partial-record-banner").textContent).toContain("clinical_summary");
    unmount();

    // Now render reconciled state
    mount(<ReferralWorkspacePage />, {
      "GET /auth/me": () => json(RECV_DOC),
      "GET /referrals/ref-partial-777": () =>
        json({
          ...baseRef,
          is_partial: false,
          completeness_status: "RECONCILED",
          missing_fields: [],
          reconciled_at: "2026-11-24T04:30:00Z",
        }),
      "GET /patients/pat-1/chart": () => json({ active_medications: [], active_allergies: [] }),
    });

    await waitFor(() => expect(screen.getByTestId("reconciled-record-banner")).toBeTruthy());
    expect(screen.queryByTestId("partial-record-banner")).toBeNull();
  });
});
