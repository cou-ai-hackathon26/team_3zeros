import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const nav = { pathname: "/en/dashboard", params: {} as Record<string, string>, search: "" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
  useParams: () => ({ locale: nav.pathname.split("/")[1], ...nav.params }),
}));

import { createApiClient } from "../api/client";
import { AppProviders, makeQueryClient } from "../api/queries/provider";
import { Toaster } from "../components/Toast/Toast";
import DashboardPage from "./[locale]/(clinician)/dashboard/page";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const err = (code: string, status: number) => json({ error: { code, message: code, request_id: "req-9" } }, status);
const page = (results: unknown[]) => json({ results, next_cursor: null });
type Route = (req: Request) => Response | Promise<Response>;

export function mount(ui: React.ReactElement, routes: Record<string, Route>) {
  const calls: { key: string; body: string; headers: Headers }[] = [];
  const fetchImpl = async (req: Request) => {
    const u = new URL(req.url);
    const key = `${req.method} ${u.pathname.replace("/api/v1", "")}${u.search}`;
    calls.push({ key, body: await req.clone().text(), headers: new Headers(req.headers) });
    const hit = Object.entries(routes).find(([k]) => key === k || key.startsWith(k + "?") || key.startsWith(k + "&"));
    return hit ? hit[1](req) : err("not_found", 404);
  };
  const client = createApiClient({ baseUrl: "http://localhost/api/v1", getCsrfToken: () => "csrf", fetchImpl: fetchImpl as unknown as typeof fetch });
  const view = render(<AppProviders client={client} queryClient={makeQueryClient()}><Toaster>{ui}</Toaster></AppProviders>);
  return { ...view, calls };
}

const ME = (roles: string[], permissions: string[] = []) => ({ id: "u", email: null, phone: null, display_name: "Dr. R", preferred_language: "en", roles, permissions, active_facility: { id: "f1", name: "Tangail" }, is_platform_admin: false });
const appt = (id: string, state = "REQUESTED", o: Record<string, unknown> = {}) => ({
  id, state, patient_id: "p" + id, practitioner_name: "Dr. R", facility_name: "Tangail", slot: { id: "s" + id, start: "2026-11-26T04:30:00Z", end: "2026-11-26T05:00:00Z" },
  allowed_actions: ["accept", "decline"], version: 2, created_at: "2026-11-23T08:00:00Z", updated_at: "2026-11-23T08:00:00Z", history: [], triage_session_id: null, ...o,
});
const referral = (id: string, state: string, o: Record<string, unknown> = {}) => ({
  id, state, reference_code: "R-" + id, urgency: "routine", emergency_mode: false, reason: "Chest pain", patient_id: "p" + id, patient_name: "Karim",
  sender_facility_id: "f9", sender_facility_name: "Mirzapur UHC", receiver_facility_id: "f1", receiver_facility_name: "Tangail", summary: { sections: [{ title: "History", text: "Three days." }] },
  consent_state: "active", allowed_actions: ["acknowledge", "decline"], version: 5, fhir_sync_status: "NOT_REQUIRED", history: [], created_at: "2026-11-23T07:00:00Z", updated_at: "2026-11-23T07:00:00Z", ...o,
});
const patient = (id: string, name: string, bn = "") => ({ id, given_name: name, family_name: "Uddin", name_bn: bn, sex: "male", birth_date: "1972-01-01", identifiers: [], version: 1 });

beforeEach(() => { nav.pathname = "/en/dashboard"; nav.params = {}; nav.search = ""; });

function dashboardRoutes(o: { me?: unknown; appts?: unknown[]; incoming?: unknown[]; outgoing?: unknown[]; extra?: Record<string, Route> } = {}) {
  return {
    "GET /auth/me": () => json(o.me ?? ME(["clinician"])),
    "GET /appointments": () => page(o.appts ?? []),
    "GET /referrals?direction=incoming": () => page(o.incoming ?? []),
    "GET /referrals?direction=outgoing": () => page(o.outgoing ?? []),
    "GET /patients/pa1": () => json(patient("pa1", "Karim", "করিম উদ্দিন")),
    "GET /patients/pi1": () => json(patient("pi1", "Nasima")),
    "GET /patients/pi2": () => json(patient("pi2", "Rahim")),
    "GET /patients/pa1/chart": () => json({ patient_id: "pa1", encounters: [{ id: "e1", patient_id: "pa1", facility_id: "f1", facility_name: "Tangail", period_start: "2026-11-01T04:00:00Z", encounter_type: "outpatient", reason: "Fever", observations: [] }] }),
    ...(o.extra ?? {}),
  };
}

describe("/dashboard (APPLICATION_DESIGN §5.2)", () => {
  it("shows the four tabs with plain-number counts, and the tabs really filter", async () => {
    mount(<DashboardPage />, dashboardRoutes({ appts: [appt("a1")], incoming: [referral("i1", "SENT"), referral("i2", "ACKNOWLEDGED_BY_RECEIVER", { allowed_actions: ["start"] })], outgoing: [referral("o1", "SENT", { allowed_actions: [] })] }));
    const needs = await screen.findByRole("tab", { name: /Needs you/ });
    expect(needs.textContent).toContain("3"); // appointment + two incoming referrals waiting on this clinician
    expect(screen.getByRole("tab", { name: /Incoming referrals/ }).textContent).toContain("2");
    expect(screen.getByRole("tab", { name: /To verify/ }).textContent).toContain("0");
    expect(screen.getByRole("tab", { name: /Outgoing/ }).textContent).toContain("1");
    expect(await screen.findAllByRole("option")).toHaveLength(3);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Outgoing/ })); fireEvent.click(screen.getByRole("tab", { name: /Outgoing/ }));
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    fireEvent.mouseDown(screen.getByRole("tab", { name: /To verify/ })); fireEvent.click(screen.getByRole("tab", { name: /To verify/ }));
    expect(await screen.findByText("Reports appear here when they finish processing.")).toBeTruthy();
  });

  it("sorts escalated referrals first with their urgency word, and names patients from their records in both scripts", async () => {
    mount(<DashboardPage />, dashboardRoutes({ appts: [appt("a1")], incoming: [referral("i1", "ESCALATED", { urgency: "emergency", escalated_at: "2026-11-23T09:00:00Z" })] }));
    const options = await screen.findAllByRole("option");
    expect(options[0].textContent).toContain("Emergency");
    expect(options[0].getAttribute("data-escalated")).toBe("true");
    expect((await screen.findAllByText(/Karim Uddin/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/করিম উদ্দিন/)).length).toBeGreaterThan(0);
  });

  it("empty: one sentence per tab", async () => {
    mount(<DashboardPage />, dashboardRoutes());
    expect(await screen.findByText("No requests waiting. New requests appear here.")).toBeTruthy();
  });

  it("opening an item shows who holds it, the tracker and only the server's allowed actions", async () => {
    mount(<DashboardPage />, dashboardRoutes({ appts: [appt("a1", "REQUESTED", { allowed_actions: ["accept", "decline"] })] }));
    const article = await screen.findByRole("article");
    expect(within(article).getByRole("region", { name: "With the doctor" })).toBeTruthy();
    expect(within(article).getByRole("button", { name: "Accept request" })).toBeTruthy();
    expect(within(article).queryByRole("button", { name: /Propose|Cancel/ })).toBeNull();
  });

  it("accepting posts with If-Match and an idempotency key, then selects the next row", async () => {
    let accepted = false;
    const { calls } = mount(<DashboardPage />, dashboardRoutes({
      appts: [appt("a1")],
      incoming: [referral("i1", "SENT")],
      extra: { "GET /appointments": () => page(accepted ? [] : [appt("a1")]), "POST /appointments/a1/actions/accept": () => { accepted = true; return json(appt("a1", "CONFIRMED", { allowed_actions: [] })); } },
    }));
    await screen.findByRole("article");
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Accept request" })); });
    const post = await waitFor(() => { const c = calls.find((x) => x.key === "POST /appointments/a1/actions/accept"); expect(c).toBeTruthy(); return c!; });
    expect(post.headers.get("If-Match")).toBe("2");
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1)); // the row left the queue
    expect(screen.getByRole("button", { name: "Acknowledge referral" })).toBeTruthy(); // next item selected
  });

  it("a 202 on an action is not announced as done (INV-12)", async () => {
    mount(<DashboardPage />, dashboardRoutes({ incoming: [referral("i1", "SENT", { allowed_actions: ["acknowledge"] })], extra: { "POST /referrals/i1/actions/acknowledge": () => json(referral("i1", "SENT", { pending_action: "acknowledge" }), 202) } }));
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Acknowledge referral" })); });
    await waitFor(() => expect(screen.queryByText("Referral acknowledged")).toBeNull());
  });

  it("J and K move through the queue and Enter opens the item", async () => {
    mount(<DashboardPage />, dashboardRoutes({ appts: [appt("a1")], incoming: [referral("i1", "SENT")] }));
    const list = await screen.findByRole("listbox");
    fireEvent.keyDown(list, { key: "j" });
    fireEvent.keyDown(list, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("article").getAttribute("aria-label")).toBeTruthy());
  });

  it("a failed chart shows an error in the patient pane only; the decision is still available", async () => {
    mount(<DashboardPage />, dashboardRoutes({ appts: [appt("a1")], extra: { "GET /patients/pa1/chart": () => err("provider_unavailable", 503) } }));
    expect(await screen.findByRole("button", { name: "Accept request" })).toBeTruthy();
    expect(await screen.findByText("We could not load the patient's record.", {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept request" })).toBeTruthy();
  });

  it("facility staff without permissions see only the Needs you tab", async () => {
    mount(<DashboardPage />, dashboardRoutes({ me: ME(["facility_staff"]), appts: [appt("a1")] }));
    await screen.findByRole("tab", { name: /Needs you/ });
    expect(screen.getAllByRole("tab")).toHaveLength(1);
  });

  it("a failed list shows a retryable error", async () => {
    mount(<DashboardPage />, dashboardRoutes({ extra: { "GET /appointments": () => err("provider_unavailable", 503) } }));
    expect(await screen.findByText("We could not load the queue.", {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
