import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import ReferralsPage from "./[locale]/(clinician)/referrals/page";
import OutgoingReferralsPage from "./[locale]/(clinician)/referrals/outgoing/page";
import NewReferralPage from "./[locale]/(clinician)/referrals/new/page";
import PatientsPage from "./[locale]/(clinician)/patients/page";
import PatientChartPage from "./[locale]/(clinician)/patients/[id]/page";
import VerifyReportPage from "./[locale]/(clinician)/patients/[id]/reports/[docId]/verify/page";
import EmergencyPage from "./[locale]/(clinician)/emergency/page";
import { emergencyStore } from "../offline/store";
import ReferralWorkspacePage from "./[locale]/(clinician)/referrals/[id]/page";

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
  sender_facility_id: "f9", sender_facility_name: "Mirzapur UHC", receiver_facility_id: "f1", receiver_facility_name: "Tangail", summary: { sections: [{ name: "History", statements: [{ text: "Three days.", source_refs: ["document:d1#page=1"] }] }] },
  consent_state: "active", allowed_actions: ["acknowledge", "decline"], version: 5, fhir_sync_status: "NOT_REQUIRED", history: [], created_at: "2026-11-23T07:00:00Z", updated_at: "2026-11-23T07:00:00Z", ...o,
});
const patient = (id: string, name: string, bn = "") => ({ id, given_name: name, family_name: "Uddin", name_bn: bn, sex: "male", birth_date: "1972-01-01", identifiers: [], version: 1 });

beforeEach(() => { nav.pathname = "/en/dashboard"; nav.params = {}; nav.search = ""; });

function dashboardRoutes(o: { me?: unknown; appts?: unknown[]; incoming?: unknown[]; outgoing?: unknown[]; extra?: Record<string, Route> } = {}) {
  return {
    "GET /auth/me": () => json(o.me ?? ME(["clinician"])),
    "GET /appointments": () => page(o.appts ?? []),
    "GET /referrals/?direction=incoming": () => page(o.incoming ?? []),
    "GET /referrals/?direction=outgoing": () => page(o.outgoing ?? []),
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

describe("/referrals index", () => {
  beforeEach(() => { nav.pathname = "/en/referrals"; });
  const routes = (inc: unknown[] = [], out: unknown[] = []) => ({
    "GET /auth/me": () => json(ME(["clinician"])),
    "GET /referrals/?direction=incoming": () => page(inc),
    "GET /referrals/?direction=outgoing": () => page(out),
  });

  it("lists open referrals by default with state words, hides finished ones, and the chips switch the view", async () => {
    mount(<ReferralsPage />, routes([referral("i1", "SENT"), referral("i2", "CLOSED", { patient_name: "Done Person" })]));
    expect((await screen.findAllByText("Karim")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Done Person")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Finished" }));
    expect((await screen.findAllByText("Done Person")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Finished" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("renders a table for large screens and a list for small ones, each with a link to the referral", async () => {
    mount(<ReferralsPage />, routes([referral("i1", "SENT")]));
    await screen.findAllByText("Karim");
    expect(screen.getByRole("columnheader", { name: "Patient" })).toBeTruthy();
    const links = screen.getAllByRole("link", { name: /Karim/ });
    expect(links.every((a) => a.getAttribute("href") === "/en/referrals/i1")).toBe(true);
  });

  it("the outgoing tab offers New referral to clinicians only", async () => {
    const { unmount } = mount(<OutgoingReferralsPage />, routes([], [referral("o1", "DRAFT", { allowed_actions: [] })]));
    expect((await screen.findByRole("link", { name: "New referral" })).getAttribute("href")).toBe("/en/referrals/new");
    unmount();
    mount(<OutgoingReferralsPage />, { ...routes(), "GET /auth/me": () => json(ME(["facility_staff"], ["referral.acknowledge"])) });
    await screen.findByRole("tab", { name: "Incoming" });
    expect(screen.queryByRole("tab", { name: "Outgoing" })).toBeNull();
    expect(screen.queryByRole("link", { name: "New referral" })).toBeNull();
  });

  it("looks a referral up by slip code, and says so when none is found", async () => {
    mount(<ReferralsPage />, { ...routes(), "GET /referrals/by-reference/EM-12": () => json(referral("i9", "SENT", { reference_code: "EM-12" })), "GET /referrals/by-reference/NOPE": () => err("not_found", 404) });
    await screen.findByRole("tab", { name: "Incoming" });
    fireEvent.change(screen.getByLabelText("Find by slip code"), { target: { value: "EM-12" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find" })); });
    expect((await screen.findByRole("link", { name: /Karim, EM-12/ })).getAttribute("href")).toBe("/en/referrals/i9");
    fireEvent.change(screen.getByLabelText("Find by slip code"), { target: { value: "NOPE" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find" })); });
    expect(await screen.findByText("No referral with that code at your facility.")).toBeTruthy();
  });

  it("empty and error states", async () => {
    const { unmount } = mount(<ReferralsPage />, routes([]));
    expect(await screen.findByText("No referrals here yet.")).toBeTruthy();
    unmount();
    mount(<ReferralsPage />, { ...routes(), "GET /referrals/?direction=incoming": () => err("provider_unavailable", 503) });
    expect(await screen.findByText("We could not load referrals.", {}, { timeout: 4000 })).toBeTruthy();
  });
});

describe("/referrals/new", () => {
  beforeEach(() => { nav.pathname = "/en/referrals/new"; nav.search = ""; });
  const routes = (extra: Record<string, Route> = {}) => ({
    "GET /auth/me": () => json(ME(["clinician"])),
    "GET /patients/": () => page([patient("p1", "Karim", "করিম")]),
    "GET /patients/p1": () => json(patient("p1", "Karim", "করিম")),
    "GET /patients/p1/chart": () => json({ patient_id: "p1", encounters: [{ id: "e1", patient_id: "p1", facility_id: "f1", facility_name: "Tangail", period_start: "2026-11-01T04:00:00Z", encounter_type: "outpatient", reason: "Fever", observations: [] }] }),
    "GET /directory/facilities": () => page([{ id: "fx", name: "Dhaka Medical College Hospital", latest_capacity: { reported_value: 5, reported_at: new Date(Date.now() - 7200_000).toISOString(), source: "Facility desk", is_stale: false } }]),
    ...extra,
  });

  it("before searching it says how to search and invents no recent-patients list", async () => {
    mount(<NewReferralPage />, routes());
    expect(await screen.findByText("Search by name, phone or ID.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Karim/ })).toBeNull();
  });

  it("validates required fields before sending", async () => {
    const { calls } = mount(<NewReferralPage />, routes());
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Create draft" })); });
    expect(screen.getAllByText("This field is required.").length).toBeGreaterThanOrEqual(2);
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
  });

  it("search, pick a patient and a visit, choose a destination with dated capacity, and create the draft", async () => {
    const { calls } = mount(<NewReferralPage />, routes({ "POST /referrals/": () => json(referral("new1", "DRAFT"), 201) }));
    fireEvent.change(await screen.findByLabelText("Search by name, phone or ID"), { target: { value: "Kar" } });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Karim Uddin/ })); });
    expect(await screen.findByText(/Selected: Karim Uddin/)).toBeTruthy();
    await screen.findByRole("option", { name: /Fever/ });
    fireEvent.change(screen.getByLabelText("Visit (optional)"), { target: { value: "e1" } });
    expect(await screen.findByRole("option", { name: /Dhaka Medical College Hospital, Reported 2 hours ago by Facility desk/ })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: /Destination/ }), { target: { value: "fx" } });
    fireEvent.change(screen.getByLabelText(/Reason for referral/), { target: { value: "Needs cardiology review" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Create draft" })); });
    const post = await waitFor(() => { const c = calls.find((x) => x.key === "POST /referrals/"); expect(c).toBeTruthy(); return c!; });
    expect(JSON.parse(post.body)).toEqual({ patient_id: "p1", receiver_facility_id: "fx", urgency: "routine", reason: "Needs cardiology review", encounter_id: "e1" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("opened from a chart it is pre-filled, and Emergency urgency offers the emergency referral instead", async () => {
    nav.search = "?patient=p1";
    mount(<NewReferralPage />, routes());
    expect(await screen.findByText(/Selected: Karim Uddin/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Emergency" }));
    expect(screen.getByRole("link", { name: "Use emergency referral instead" }).getAttribute("href")).toBe("/en/emergency");
  });

  it("binds server field errors to their fields", async () => {
    nav.search = "?patient=p1";
    mount(<NewReferralPage />, routes({ "POST /referrals/": () => json({ error: { code: "validation_error", message: "x", field_errors: { reason: ["Reason is too short."] }, request_id: "r" } }, 400) }));
    await screen.findByText(/Selected: Karim Uddin/);
    fireEvent.change(await screen.findByRole("combobox", { name: /Destination/ }), { target: { value: "" } });
    await screen.findByRole("option", { name: /Dhaka Medical/ });
    fireEvent.change(screen.getByRole("combobox", { name: /Destination/ }), { target: { value: "fx" } });
    fireEvent.change(screen.getByLabelText(/Reason for referral/), { target: { value: "x" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Create draft" })); });
    expect(await screen.findByText("Reason is too short.")).toBeTruthy();
  });
});

describe("/referrals/[id] workspace", () => {
  beforeEach(() => { nav.pathname = "/en/referrals/r1"; nav.params = { id: "r1" }; });
  const routes = (r: unknown, extra: Record<string, Route> = {}) => ({ "GET /auth/me": () => json(ME(["clinician"])), "GET /referrals/r1": () => json(r), ...extra });

  it("leads with the holder, the tracker and, when sent, who it is waiting on", async () => {
    mount(<ReferralWorkspacePage />, routes(referral("r1", "SENT", { sent_at: new Date(Date.now() - 3 * 3600_000).toISOString() })));
    expect(await screen.findByRole("region", { name: "With Tangail" })).toBeTruthy();
    expect(screen.getByText("Waiting for Tangail to acknowledge, 3 hours ago")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Acknowledge referral" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Approve|Send/ })).toBeNull();
  });

  it("a draft is editable; editing disables the actions until saved, and saving sends If-Match", async () => {
    let saved = false;
    const base = referral("r1", "DRAFT", { allowed_actions: ["request_consent", "cancel"], summary_origin: "ai" });
    const { calls } = mount(<ReferralWorkspacePage />, routes(base, {
      "GET /referrals/r1": () => json(saved ? { ...base, version: 6, reason: "Updated reason" } : base),
      "PATCH /referrals/r1": () => { saved = true; return json({ ...base, version: 6, reason: "Updated reason" }); },
    }));
    expect((await screen.findAllByText("Draft")).length).toBeGreaterThanOrEqual(2); // status badge and the DraftBlock tag for unverified AI content
    const ask = screen.getByRole("button", { name: /Ask patient to share|Request/ }) as HTMLButtonElement;
    expect(ask.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Reason for referral"), { target: { value: "Updated reason" } });
    expect(await screen.findByText(/You have unsaved changes/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Ask patient to share|Request/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save changes" })); });
    const patch = await waitFor(() => { const c = calls.find((x) => x.key === "PATCH /referrals/r1"); expect(c).toBeTruthy(); return c!; });
    expect(patch.headers.get("If-Match")).toBe("5");
    expect(JSON.parse(patch.body).reason).toBe("Updated reason");
    await waitFor(() => expect(screen.queryByText(/You have unsaved changes/)).toBeNull());
  });

  it("after the draft stage the content is read-only", async () => {
    mount(<ReferralWorkspacePage />, routes(referral("r1", "SENT")));
    await screen.findByRole("region", { name: "With Tangail" });
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate draft" })).toBeNull();
  });

  it("recording an outcome asks for it and sends it with the action", async () => {
    const { calls } = mount(<ReferralWorkspacePage />, routes(referral("r1", "IN_PROGRESS", { allowed_actions: ["record_outcome"] }), { "POST /referrals/r1/actions/record_outcome": () => json(referral("r1", "OUTCOME_RETURNED", { allowed_actions: [] })) }));
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /outcome/i })); });
    fireEvent.change(await screen.findByLabelText(/Outcome/), { target: { value: "Admitted and stable" } });
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /outcome/i })); });
    const post = await waitFor(() => { const c = calls.find((x) => x.key === "POST /referrals/r1/actions/record_outcome"); expect(c).toBeTruthy(); return c!; });
    expect(JSON.parse(post.body)).toEqual({ outcome: { summary: "Admitted and stable" } });
  });

  it("FAILED_TO_SYNC and emergency referrals explain themselves", async () => {
    const { unmount } = mount(<ReferralWorkspacePage />, routes(referral("r1", "FAILED_TO_SYNC", { allowed_actions: ["retry_sync"] })));
    expect(await screen.findByText("This could not be saved to the record. Try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry/ })).toBeTruthy();
    unmount();
    mount(<ReferralWorkspacePage />, routes(referral("r1", "SENT", { emergency_mode: true, consent_state: "emergency_exception_pending_policy" })));
    expect(await screen.findByText(/five essential details/)).toBeTruthy();
  });

  it("412 on an action refetches and says it was updated; 404 is one message", async () => {
    const { unmount } = mount(<ReferralWorkspacePage />, routes(referral("r1", "SENT"), { "POST /referrals/r1/actions/acknowledge": () => err("stale_version", 412) }));
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Acknowledge referral" })); });
    expect(await screen.findByText(/updated by someone else|latest version/i)).toBeTruthy();
    unmount();
    mount(<ReferralWorkspacePage />, { "GET /auth/me": () => json(ME(["clinician"])), "GET /referrals/r1": () => err("not_found", 404) });
    expect(await screen.findByText("We could not find that referral, or you do not have access to it.")).toBeTruthy();
  });
});

describe("/patients", () => {
  beforeEach(() => { nav.pathname = "/en/patients"; });
  it("before searching it says how to search and shows no list", async () => {
    const { calls } = mount(<PatientsPage />, {});
    expect(screen.getByText("Search by name, phone or ID.")).toBeTruthy();
    expect(calls).toEqual([]);
  });
  it("searches through the API once typing pauses and links each result to its chart", async () => {
    const { calls } = mount(<PatientsPage />, { "GET /patients/": () => page([patient("p1", "Karim", "করিম")]) });
    fireEvent.change(screen.getByLabelText("Search patients"), { target: { value: "Kar" } });
    const link = await screen.findByRole("link", { name: /Karim Uddin/ });
    expect(link.getAttribute("href")).toBe("/en/patients/p1");
    expect(calls.some((c) => c.key === "GET /patients/?q=Kar")).toBe(true);
  });
  it("says when nothing matches and when the search fails", async () => {
    const { unmount } = mount(<PatientsPage />, { "GET /patients/": () => page([]) });
    fireEvent.change(screen.getByLabelText("Search patients"), { target: { value: "zzz" } });
    expect(await screen.findByText("No patient matches.")).toBeTruthy();
    unmount();
    mount(<PatientsPage />, { "GET /patients/": () => err("provider_unavailable", 503) });
    fireEvent.change(screen.getByLabelText("Search patients"), { target: { value: "zzz" } });
    expect(await screen.findByText("We could not search.", {}, { timeout: 4000 })).toBeTruthy();
  });
});

describe("/patients/[id] chart", () => {
  beforeEach(() => { nav.pathname = "/en/patients/p1"; nav.params = { id: "p1" }; });
  const chartRoutes = (extra: Record<string, Route> = {}) => ({
    "GET /auth/me": () => json(ME(["clinician"])),
    "GET /patients/p1": () => json(patient("p1", "Karim", "করিম")),
    "GET /patients/p1/chart": () => json({ patient_id: "p1", encounters: [{ id: "e1", patient_id: "p1", facility_id: "f1", facility_name: "Tangail", period_start: "2026-11-01T04:00:00Z", encounter_type: "outpatient", reason: "Fever", observations: [{ id: "o1", code: "temp", display_name: "Temperature", value_string: "38.5", unit: "C" }] }] }),
    "GET /patients/p1/duplicate-candidates": () => json([]),
    "GET /referrals/?direction=incoming": () => page([]),
    "GET /referrals/?direction=outgoing": () => page([referral("r1", "SENT", { patient_id: "p1" }), referral("r2", "SENT", { patient_id: "other" })]),
    ...extra,
  });

  it("shows the identity header in both scripts, the latest visit, and refer and record-visit actions", async () => {
    mount(<PatientChartPage />, chartRoutes());
    expect(await screen.findByRole("heading", { level: 1, name: /Karim Uddin/ })).toBeTruthy();
    expect(screen.getByText("(করিম)")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Refer this patient" }).getAttribute("href")).toBe("/en/referrals/new?patient=p1");
    expect(await screen.findByText(/Temperature: 38.5 C/)).toBeTruthy();
    expect(screen.queryByText(/break-glass/i)).toBeNull();
  });

  it("the Referrals tab shows only this patient's referrals", async () => {
    mount(<PatientChartPage />, chartRoutes());
    await screen.findByRole("heading", { level: 1, name: /Karim Uddin/ });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Referrals" })); fireEvent.click(screen.getByRole("tab", { name: "Referrals" }));
    expect((await screen.findAllByRole("link")).filter((a) => a.getAttribute("href") === "/en/referrals/r1")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /r2/ })).toBeNull();
  });

  it("a possible duplicate is a notice with two choices and a confirmation; nothing merges until confirmed", async () => {
    const { calls } = mount(<PatientChartPage />, chartRoutes({
      "GET /patients/p1/duplicate-candidates": () => json([{ id: "c1", patient_a_id: "p1", patient_b_id: "p2", score: 0.9, reasons: [], status: "open" }]),
      "POST /patients/p1/duplicate-candidates/c1/resolve": () => json({}),
    }));
    expect(await screen.findByText("This record may be the same person as another record.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Different person" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Confirm your decision" });
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" })); });
    const post = await waitFor(() => { const c = calls.find((x) => x.key.endsWith("/resolve")); expect(c).toBeTruthy(); return c!; });
    expect(JSON.parse(post.body)).toEqual({ status: "different" });
  });

  it("a facility staff member without a clinician role has no Refer button", async () => {
    mount(<PatientChartPage />, chartRoutes({ "GET /auth/me": () => json(ME(["facility_staff"])) }));
    await screen.findByRole("heading", { level: 1, name: /Karim Uddin/ });
    expect(screen.queryByRole("link", { name: "Refer this patient" })).toBeNull();
  });

  it("404 is one message", async () => {
    mount(<PatientChartPage />, chartRoutes({ "GET /patients/p1": () => err("not_found", 404) }));
    expect(await screen.findByText("We could not find that patient, or you do not have access to it.")).toBeTruthy();
  });
});

describe("/patients/[id]/reports/[docId]/verify", () => {
  beforeEach(() => { nav.pathname = "/en/patients/p1/reports/d1/verify"; nav.params = { id: "p1", docId: "d1" }; });
  const doc = (state: string) => ({ id: "d1", patient_id: "p1", original_filename: "cbc.pdf", content_type: "application/pdf", size: 10, state, created_at: "2026-11-23T08:00:00Z" });
  const field = { id: "f1", name: "Hemoglobin", value: "10.2", unit: "g/dL", observed_date: "2026-11-20", lab: "City Lab", confidence: 0.7, page: 1, bbox: [0.1, 0.2, 0.4, 0.25], status: "candidate" };
  const routes = (state: string, extra: Record<string, Route> = {}) => ({
    "GET /auth/me": () => json(ME(["clinician"])),
    "GET /documents/d1": () => json(doc(state)),
    "GET /documents/d1/extraction": () => json({ document_id: "d1", state, fields: [field] }),
    "GET /patients/p1/results": () => json({ patient_id: "p1", results: [{ id: "r", code: "hb", display_name: "Hemoglobin", value: "11.5", unit: "g/dL", observed_date: "2026-08-01T00:00:00Z", lab: "City Lab" }] }),
    ...extra,
  });

  it("while OCR runs it shows a processing label, not values", async () => {
    mount(<VerifyReportPage />, routes("OCR_RUNNING"));
    expect(await screen.findAllByText("Reading the report…", {}, { timeout: 2500 })).toBeTruthy(); // label appears after 1 s
    expect(screen.queryByText("Hemoglobin")).toBeNull();
  });

  it("OCR failure offers Retry reading", async () => {
    const { calls } = mount(<VerifyReportPage />, routes("OCR_FAILED", { "POST /documents/d1/actions/retry_ocr": () => json({}) }));
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Retry reading" })); });
    await waitFor(() => expect(calls.some((c) => c.key === "POST /documents/d1/actions/retry_ocr")).toBe(true));
  });

  it("shows extracted values with a Check this marker (no percentage) and earlier results with date and lab (INV-15)", async () => {
    mount(<VerifyReportPage />, routes("EXTRACTED_UNVERIFIED"));
    expect(await screen.findByDisplayValue("10.2")).toBeTruthy();
    expect(screen.getByText("Check this")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/70\s?%|0\.7/);
    expect(screen.getByText(/Earlier result:/)).toBeTruthy();
    expect(screen.getByText(/2026-08-01, City Lab/)).toBeTruthy();
  });

  it("confirming sends the edited values and shows saving, never done, until the server says VERIFIED (INV-12)", async () => {
    const { calls } = mount(<VerifyReportPage />, routes("EXTRACTED_UNVERIFIED", { "POST /documents/d1/extraction/verify": () => json({}, 202) }));
    fireEvent.change(await screen.findByDisplayValue("10.2"), { target: { value: "10.4" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Confirm|Verify/ })); });
    const post = await waitFor(() => { const c = calls.find((x) => x.key === "POST /documents/d1/extraction/verify"); expect(c).toBeTruthy(); return c!; });
    expect(JSON.parse(post.body).fields[0]).toMatchObject({ name: "Hemoglobin", value: "10.4" });
    expect(await screen.findByText("Sending…")).toBeTruthy();
    expect(screen.queryByText("These values are verified.")).toBeNull();
  });

  it("copes with the backend's empty-object bbox default instead of crashing", async () => {
    mount(<VerifyReportPage />, routes("EXTRACTED_UNVERIFIED", { "GET /documents/d1/extraction": () => json({ document_id: "d1", state: "EXTRACTED_UNVERIFIED", fields: [{ ...field, bbox: {} }] }) }));
    expect(await screen.findByDisplayValue("10.2")).toBeTruthy();
  });

  it("a verified, rejected or blocked document says so and offers nothing to change", async () => {
    const { unmount } = mount(<VerifyReportPage />, routes("VERIFIED"));
    expect(await screen.findByText("These values are verified.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Confirm|Verify/ })).toBeNull();
    unmount();
    mount(<VerifyReportPage />, routes("QUARANTINED"));
    expect(await screen.findByText("This file was blocked and cannot be opened.")).toBeTruthy();
  });

  it("404 is one message", async () => {
    mount(<VerifyReportPage />, { "GET /auth/me": () => json(ME(["clinician"])), "GET /documents/d1": () => err("not_found", 404) });
    expect(await screen.findByText("We could not find that report, or you do not have access to it.")).toBeTruthy();
  });
});

describe("/emergency (INV-16)", () => {
  beforeEach(() => { nav.pathname = "/en/emergency"; });
  afterEach(async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await emergencyStore.syncAll(async () => ({ status: 201, body: {} })); // drain whatever a test left queued
  });
  const base = (extra: Record<string, Route> = {}) => ({
    "GET /auth/me": () => json(ME(["clinician"])),
    "GET /directory/facilities": () => page([{ id: "fr", name: "Dhaka Medical College Hospital", latest_capacity: null }]),
    ...extra,
  });
  const fill = async () => {
    fireEvent.change(await screen.findByLabelText(/Reason for transfer/), { target: { value: "Seizure in pregnancy" } });
    fireEvent.change(screen.getByLabelText(/Who is the patient/), { target: { value: "Woman, about 28 years, name not known" } });
    fireEvent.change(screen.getByLabelText(/Blood pressure/), { target: { value: "১৬০" } });
  };
  const chooseReceiver = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Add more details" }));
    await screen.findByRole("option", { name: "Dhaka Medical College Hospital" });
    fireEvent.change(screen.getByRole("combobox", { name: /Receiving facility/ }), { target: { value: "fr" } });
  };

  it("has no pre-filled patient, vitals or facility, defaults urgency to Emergency, and shows the SyncBadge", async () => {
    mount(<EmergencyPage />, base());
    expect((await screen.findByLabelText(/Who is the patient/) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/Blood pressure/) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("radio", { name: "Emergency" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Karim|160\/100|UHC12|\b(Q|INV)-\d+/);
  });

  it("offline: saves on the device, shows the slip with the provisional code, sends nothing, and is not blocked by a missing receiver", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { calls } = mount(<EmergencyPage />, base());
    await fill();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save and send" })); });
    expect(await screen.findByText("Saved on this device. It will be sent when you are connected.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Transfer slip ready" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print slip" })).toBeTruthy();
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
  });

  it("online with a receiver: sends once to /referrals/emergency with the idempotency key, normalised digits and the receiver, then shows the reference", async () => {
    const { calls } = mount(<EmergencyPage />, base({ "POST /referrals/emergency": () => json({ id: "e1", reference_code: "MW-2026-77" }, 201) }));
    await fill();
    await chooseReceiver();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save and send" })); });
    expect(await screen.findByText("Sent. Reference MW-2026-77.")).toBeTruthy();
    const posts = calls.filter((c) => c.key === "POST /referrals/emergency");
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0].body);
    expect(body).toMatchObject({ reason: "Seizure in pregnancy", urgency: "emergency", facility_id: "fr", treatment_given: "" });
    expect(body.vitals.items).toEqual([{ code: "BP", value: "160", unit: "mmHg" }]);
    expect(posts[0].headers.get("Idempotency-Key")).toBe(body.idempotency_key);
    expect(await emergencyStore.listItems()).toHaveLength(0); // synced items are deleted locally
  });

  it("online without a receiver: stays queued and says what is needed, without blocking the slip", async () => {
    const { calls } = mount(<EmergencyPage />, base());
    await fill();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save and send" })); });
    expect((await screen.findAllByText(/Choose the receiving facility to send this/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Print slip" })).toBeTruthy();
    expect(calls.some((c) => c.key === "POST /referrals/emergency")).toBe(false);
  });

  it("a failed send is retried with the same idempotency key when the connection returns, creating one referral", async () => {
    let n = 0;
    const keys: string[] = [];
    const { calls } = mount(<EmergencyPage />, base({
      "POST /referrals/emergency": (req) => { keys.push(req.headers.get("Idempotency-Key") ?? ""); n++; if (n === 1) throw new TypeError("Failed to fetch"); return json({ id: "e1", reference_code: "MW-1" }, 201); },
    }));
    await fill();
    await chooseReceiver();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save and send" })); });
    expect(await screen.findByText("Saved on this device but not sent yet. It will be tried again.")).toBeTruthy();
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(await screen.findByText("Sent. Reference MW-1.")).toBeTruthy();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(calls.filter((c) => c.key === "POST /referrals/emergency")).toHaveLength(2);
  });

  it("a server conflict shows both-versions guidance and is not retried automatically", async () => {
    const { calls } = mount(<EmergencyPage />, base({ "POST /referrals/emergency": () => err("idempotency_conflict", 409) }));
    await fill();
    await chooseReceiver();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save and send" })); });
    expect(await screen.findByText(/different version of this referral/)).toBeTruthy();
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(calls.filter((c) => c.key === "POST /referrals/emergency")).toHaveLength(1);
  });
});
