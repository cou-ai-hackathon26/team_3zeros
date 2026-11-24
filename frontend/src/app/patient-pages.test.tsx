import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

const nav = { pathname: "/en/home", search: "", params: {} as Record<string, string> };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
  useParams: () => ({ locale: nav.pathname.split("/")[1], ...nav.params }),
}));

import { createApiClient } from "../api/client";
import { AppProviders, makeQueryClient } from "../api/queries/provider";
import { Toaster } from "../components/Toast/Toast";
import HomePage from "./[locale]/(patient)/home/page";
import AppointmentsPage from "./[locale]/(patient)/appointments/page";
import AppointmentDetailPage from "./[locale]/(patient)/appointments/[id]/page";
import ConsentsPage from "./[locale]/(patient)/consents/page";
import ConsentRequestPage from "./[locale]/(patient)/consents/[requestId]/page";
import DoctorsPage from "./[locale]/(patient)/doctors/page";
import PatientReportsPage from "./[locale]/(patient)/reports/page";
import NotificationsPage from "./[locale]/(patient)/notifications/page";
import TriagePage from "./[locale]/(patient)/triage/page";
import { PatientShell } from "../components/shell/PatientShell";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const err = (code: string, status: number) => json({ error: { code, message: code, request_id: "req-9" } }, status);
type Route = (req: Request) => Response | Promise<Response>;

function mount(ui: React.ReactElement, routes: Record<string, Route>) {
  const calls: { key: string; body: string; headers: Headers }[] = [];
  const fetchImpl = async (req: Request) => {
    const u = new URL(req.url);
    const key = `${req.method} ${u.pathname.replace("/api/v1", "")}${u.search}`;
    calls.push({ key, body: await req.clone().text(), headers: new Headers(req.headers) });
    const handler = Object.entries(routes).find(([k]) => key === k || key.startsWith(k + "?") || (k.endsWith("*") && key.startsWith(k.slice(0, -1))));
    return handler ? handler[1](req) : err("not_found", 404);
  };
  const client = createApiClient({ baseUrl: "http://localhost/api/v1", getCsrfToken: () => "csrf", fetchImpl: fetchImpl as unknown as typeof fetch });
  const view = render(<AppProviders client={client} queryClient={makeQueryClient()}><Toaster>{ui}</Toaster></AppProviders>);
  return { ...view, calls };
}

const ME = { id: "u", email: null, phone: "0171", display_name: "Karim", preferred_language: "en", roles: ["patient"], permissions: [], active_facility: null, is_platform_admin: false };
const appt = (o: Record<string, unknown> = {}) => ({
  id: "a1", state: "REQUESTED", patient_id: "p", practitioner_id: "d1", practitioner_name: "Dr. Rahima Khatun", facility_id: "f1",
  facility_name: "Tangail District Hospital", slot: { id: "s1", start: "2026-11-26T04:30:00Z", end: "2026-11-26T05:00:00Z", state: "BOOKED" },
  allowed_actions: ["cancel"], version: 3, created_at: "2026-11-23T08:00:00Z", updated_at: "2026-11-23T08:00:00Z", history: [], expires_at: null, ...o,
});
const page = (results: unknown[]) => json({ results, next_cursor: null });
const pendingReq = { id: "c1", state: "PENDING", patient_id: "p", recipient_facility_id: "f2", recipient_facility_name: "Dhaka Medical College", recipient_practitioner_name: "Dr. Anwar", purpose: "Specialist review", categories: ["Visit summary", "Lab reports"], content_hash: "h", created_at: "2026-11-23T08:00:00Z", expires_at: "2026-12-30T00:00:00Z" };

beforeEach(() => { nav.pathname = "/en/home"; nav.search = ""; nav.params = {}; });

describe("/home (APPLICATION_DESIGN §4.2)", () => {
  const consents = (pending: unknown[] = [], active: unknown[] = []) => () => json({ consents: active, pending_requests: pending });
  it("new account: shows the existing home title with start actions, no separate describe tile, and empty sentences", async () => {
    mount(<HomePage />, { "GET /appointments": () => page([]), "GET /consents/": consents() });
    expect(await screen.findByText("Tell us what is bothering you. We will guide you to a suitable doctor.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Start talking" })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Describe a problem" })).toBeNull();
    expect(screen.getByText("Your requests will appear here.")).toBeTruthy();
    expect(screen.getByText("Nobody has asked to see your record.")).toBeTruthy();
    expect(screen.getByText(/This is an automated guide, not a doctor/)).toBeTruthy();
  });

  it("a pending consent request is the next step and links to it", async () => {
    mount(<HomePage />, { "GET /appointments": () => page([appt()]), "GET /consents/": consents([pendingReq]) });
    expect(await screen.findByText("Dr. Anwar asks to see your record")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review request" }).getAttribute("href")).toBe("/en/consents/c1");
    expect(screen.getByRole("heading", { name: "Describe a problem" })).toBeTruthy();
  });

  it("a waiting request shows who has it, with the tracker, and links to the request", async () => {
    mount(<HomePage />, { "GET /appointments": () => page([appt()]), "GET /consents/": consents() });
    expect(await screen.findByText("With Dr. Rahima Khatun: waiting for a decision")).toBeTruthy();
    expect(screen.getByRole("region", { name: "With Dr. Rahima Khatun" })).toBeTruthy(); // the tracker
    expect(screen.getByRole("link", { name: "View request" }).getAttribute("href")).toBe("/en/appointments/a1");
    expect(screen.getByText("1 in progress")).toBeTruthy();
  });

  it("a confirmed visit shows the day, time and facility", async () => {
    mount(<HomePage />, { "GET /appointments": () => page([appt({ state: "CONFIRMED" })]), "GET /consents/": consents() });
    expect(await screen.findByText(/Visit confirmed: 26 Nov, 10:30, Tangail District Hospital/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "View visit" })).toBeTruthy();
  });

  it("Condition 5: an open triage session shows Continue linking to the session or summary", async () => {
    const { unmount } = mount(<HomePage />, {
      "GET /appointments": () => page([]),
      "GET /consents/": consents(),
      "GET /triage/sessions": () => page([{ id: "ts-open", state: "ACTIVE" }]),
    });
    expect(await screen.findByText("With you: finish describing your problem")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue" }).getAttribute("href")).toBe("/en/triage/session/ts-open");
    unmount();

    mount(<HomePage />, {
      "GET /appointments": () => page([]),
      "GET /consents/": consents(),
      "GET /triage/sessions": () => page([{ id: "ts-sum", state: "SUMMARY_PENDING_REVIEW" }]),
    });
    expect(await screen.findByRole("link", { name: "Continue" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue" }).getAttribute("href")).toBe("/en/triage/summary/ts-sum");
  });

  it("when a request fails, the next-step tile shows an error but Start talking still works", async () => {
    mount(<HomePage />, { "GET /appointments": () => err("provider_unavailable", 503), "GET /consents/": consents() });
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start talking" }).getAttribute("href")).toBe("/en/triage?mode=voice");
    expect(screen.getByRole("link", { name: "Type instead" }).getAttribute("href")).toBe("/en/triage?mode=text");
  });

  it("shows a skeleton with a label while loading, and no staff links anywhere", async () => {
    mount(<HomePage />, { "GET /appointments": () => new Promise<Response>(() => {}), "GET /consents/": consents() });
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Queue|Referral|\b(Q|INV)-\d+/);
  });

  it("has no axe violations", async () => {
    const { container } = mount(<HomePage />, { "GET /appointments": () => page([appt()]), "GET /consents/": consents([pendingReq]) });
    await screen.findByText("Dr. Anwar asks to see your record");
    const r = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 90)}`)).toEqual([]);
  });
});

describe("/appointments", () => {
  beforeEach(() => { nav.pathname = "/en/appointments"; });
  it("groups requests into In progress and Past, newest first, each a link with a status word and no tracker", async () => {
    mount(<AppointmentsPage />, { "GET /appointments": () => page([appt({ id: "old", state: "COMPLETED", slot: { id: "x", start: "2026-10-01T04:30:00Z", end: "2026-10-01T05:00:00Z" } }), appt({ id: "open", state: "CONFIRMED" })]) });
    const inProgress = await screen.findByRole("region", { name: "In progress" });
    expect(within(inProgress).getByRole("link").getAttribute("href")).toBe("/en/appointments/open");
    expect(within(inProgress).getByText("Confirmed")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Past" })).getByText("Visit completed")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Progress of this case" })).toBeNull();
  });
  it("empty: one sentence and a way to start", async () => {
    mount(<AppointmentsPage />, { "GET /appointments": () => page([]) });
    expect(await screen.findByText("You have no requests yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Describe your problem" })).toBeTruthy();
  });
  it("error: a message, Try again and the request id", async () => {
    mount(<AppointmentsPage />, { "GET /appointments": () => err("provider_unavailable", 503) });
    expect(await screen.findByText("We could not load your appointments.", {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByText("req-9")).toBeTruthy();
  });
});

describe("/appointments/[id]", () => {
  beforeEach(() => { nav.pathname = "/en/appointments/a1"; nav.params = { id: "a1" }; });

  it("leads with the holder line, shows only the server's allowed actions, and only shows expiry when given", async () => {
    mount(<AppointmentDetailPage />, { "GET /appointments/a1": () => json(appt({ allowed_actions: ["cancel"] })) });
    expect(await screen.findByRole("region", { name: "With Dr. Rahima Khatun" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel request" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Accept|Decline/ })).toBeNull();
    expect(screen.queryByText(/expires/)).toBeNull();
  });

  it("a proposed new time lets the patient accept or decline it, with no cancel unless the server allows", async () => {
    mount(<AppointmentDetailPage />, { "GET /appointments/a1": () => json(appt({ state: "ALTERNATE_SLOT_PROPOSED", allowed_actions: ["patient_accept", "patient_decline"], expires_at: "2026-11-30T10:00:00Z" })) });
    expect(await screen.findByRole("button", { name: "Accept proposed time" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "With you" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel request" })).toBeNull();
    expect(screen.getByText(/This request expires on 30 Nov/)).toBeTruthy();
  });

  it("cancel asks for confirmation first, then posts with If-Match and an idempotency key", async () => {
    const { calls } = mount(<AppointmentDetailPage />, {
      "GET /appointments/a1": () => json(appt()),
      "POST /appointments/a1/actions/cancel": () => json(appt({ state: "CANCELLED", allowed_actions: [] })),
    });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Cancel request" })); });
    expect(await screen.findByRole("alertdialog", { name: "Cancel this request?" })).toBeTruthy();
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
    await act(async () => { fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel request" })); });
    await waitFor(() => expect(calls.some((c) => c.key === "POST /appointments/a1/actions/cancel")).toBe(true));
    const post = calls.find((c) => c.key.startsWith("POST"))!;
    expect(post.headers.get("If-Match")).toBe("3");
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("a 202 is shown as pending, never as done (INV-12)", async () => {
    let n = 0;
    mount(<AppointmentDetailPage />, {
      "GET /appointments/a1": () => json(n++ ? appt({ pending_action: "patient_accept", fhir_sync_status: "PENDING", allowed_actions: [] }) : appt({ state: "ALTERNATE_SLOT_PROPOSED", allowed_actions: ["patient_accept"] })),
      "POST /appointments/a1/actions/patient_accept": () => json(appt({ pending_action: "patient_accept" }), 202),
    });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Accept proposed time" })); });
    expect(await screen.findByText("Sending…")).toBeTruthy(); // fhir_sync.PENDING label
    expect(screen.queryByText("Proposed time accepted")).toBeNull();
  });

  it("412 refetches and says someone else updated it", async () => {
    let gets = 0;
    mount(<AppointmentDetailPage />, {
      "GET /appointments/a1": () => { gets++; return json(appt()); },
      "POST /appointments/a1/actions/cancel": () => err("stale_version", 412),
    });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Cancel request" })); });
    await act(async () => { fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel request" })); });
    expect(await screen.findByText(/updated by someone else|latest version/i)).toBeTruthy();
    expect(gets).toBeGreaterThanOrEqual(2);
  });

  it("404 uses one message whether it is missing or hidden", async () => {
    mount(<AppointmentDetailPage />, { "GET /appointments/a1": () => err("not_found", 404) });
    expect(await screen.findByText("We could not find that request, or you do not have access to it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("/consents", () => {
  beforeEach(() => { nav.pathname = "/en/consents"; });
  const rec = (o = {}) => ({ id: "k1", patient_id: "p", recipient_facility_id: "f2", recipient_facility_name: "Dhaka Medical College", purpose: "Specialist review", categories: ["Visit summary"], content_hash: "h", method: "app", state: "ACTIVE", revoked_at: null, created_at: "2026-11-01T00:00:00Z", ...o });

  it("shows waiting first, then sharing now, then past", async () => {
    mount(<ConsentsPage />, { "GET /consents/": () => json({ pending_requests: [pendingReq], consents: [rec(), rec({ id: "k2", state: "REVOKED", revoked_at: "2026-11-10T00:00:00Z" })] }) });
    const headings = (await screen.findAllByRole("heading", { level: 2 })).map((h) => h.textContent);
    expect(headings).toEqual(["Waiting for your answer", "Sharing now", "Past"]);
    expect(screen.getByRole("link", { name: /Dr. Anwar/ }).getAttribute("href")).toBe("/en/consents/c1");
  });

  it("empty: one sentence", async () => {
    mount(<ConsentsPage />, { "GET /consents/": () => json({ pending_requests: [], consents: [] }) });
    expect(await screen.findByText("Nobody has asked to see your record.")).toBeTruthy();
  });

  it("revoking asks first, says what it does, then posts", async () => {
    const { calls } = mount(<ConsentsPage />, { "GET /consents/": () => json({ pending_requests: [], consents: [rec()] }), "POST /consents/k1/revoke": () => json({}) });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Stop sharing" })); });
    const dialog = await screen.findByRole("alertdialog", { name: "Stop sharing with Dhaka Medical College?" });
    expect(within(dialog).getByText("Dhaka Medical College will no longer be able to open your record.")).toBeTruthy();
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Stop sharing" })); });
    await waitFor(() => expect(calls.some((c) => c.key === "POST /consents/k1/revoke")).toBe(true));
  });
});

describe("/consents/[requestId] (INV-10)", () => {
  beforeEach(() => { nav.pathname = "/en/consents/c1"; nav.params = { requestId: "c1" }; });

  it("shows who, why and exactly which categories from the backend, with two equal buttons and no default", async () => {
    mount(<ConsentRequestPage />, { "GET /consent-requests/c1": () => json(pendingReq) });
    expect(await screen.findByText("Dr. Anwar (Dhaka Medical College)")).toBeTruthy();
    expect(screen.getByText("Specialist review")).toBeTruthy();
    expect(screen.getByText("Lab reports")).toBeTruthy();
    const share = screen.getByRole("button", { name: "Share with Dr. Anwar" });
    const no = screen.getByRole("button", { name: "Don't share" });
    expect(share.className).toBe(no.className); // same variant and size: neither is the default
  });

  it("granting posts once and confirms in words; sharing is not described as sent", async () => {
    const { calls } = mount(<ConsentRequestPage />, { "GET /consent-requests/c1": () => json(pendingReq), "POST /consent-requests/c1/grant": () => json({}) });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Share with Dr. Anwar" })); });
    expect(await screen.findByText("You agreed to share. Your doctor has been told.")).toBeTruthy();
    expect(calls.filter((c) => c.key === "POST /consent-requests/c1/grant")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Don't share" })).toBeNull();
  });

  it("refusing says what happens next", async () => {
    mount(<ConsentRequestPage />, { "GET /consent-requests/c1": () => json(pendingReq), "POST /consent-requests/c1/refuse": () => json({}) });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Don't share" })); });
    expect(await screen.findByText("You said no. Your record will not be sent, and your doctor has been told.")).toBeTruthy();
  });

  it("a failed answer says nothing was shared and keeps both buttons", async () => {
    mount(<ConsentRequestPage />, { "GET /consent-requests/c1": () => json(pendingReq), "POST /consent-requests/c1/grant": () => err("provider_unavailable", 503) });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Share with Dr. Anwar" })); });
    expect(await screen.findByText("We could not save your answer. Nothing was shared.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Don't share" })).toBeTruthy();
  });

  it("an already answered request shows its state and no buttons; 404 is one message", async () => {
    const { unmount } = mount(<ConsentRequestPage />, { "GET /consent-requests/c1": () => json({ ...pendingReq, state: "GRANTED" }) });
    expect(await screen.findByText("You agreed to share. Your doctor has been told.")).toBeTruthy();
    unmount();
    mount(<ConsentRequestPage />, { "GET /consent-requests/c1": () => err("not_found", 404) });
    expect(await screen.findByText("We could not find that request, or you do not have access to it.")).toBeTruthy();
  });
});

describe("/doctors", () => {
  beforeEach(() => { nav.pathname = "/en/doctors"; });
  const doctor = { id: "d1", registration_number: "BMDC-1", name: "Dr. Rahima Khatun", name_bn: "ডা. রহিমা খাতুন", specialties: [{ id: "s", code: "medicine", name_en: "Medicine", name_bn: "মেডিসিন" }], facilities: [{ id: "f1", name: "Tangail District Hospital", name_bn: "টাঙ্গাইল জেলা হাসপাতাল", type: "hospital" }] };
  const facility = { id: "f1", name: "Tangail District Hospital", latest_capacity: { reported_value: 18, reported_at: new Date(Date.now() - 3 * 3600_000).toISOString(), source: "Tangail Facility Desk", is_stale: false } };
  const base = (extra: Record<string, Route> = {}, signedIn = true) => ({
    "GET /auth/me": () => (signedIn ? json(ME) : err("not_authenticated", 401)),
    "GET /directory/practitioners": () => page([doctor]),
    "GET /directory/facilities": () => page([facility]),
    "GET /directory/specialties": () => json([{ id: "s", code: "medicine", name_en: "Medicine", name_bn: "মেডিসিন" }]),
    "GET /directory/areas": () => json([]),
    ...extra,
  });
  const slots = (state = "AVAILABLE") => json([{ id: "sl1", start: "2026-11-26T04:30:00Z", end: "2026-11-26T05:00:00Z", state }]);

  it("lists doctors as rows with specialty and facility, and a dated, sourced capacity line (INV-14)", async () => {
    mount(<DoctorsPage />, base());
    expect(await screen.findByText("Dr. Rahima Khatun")).toBeTruthy();
    expect(screen.getByText("Medicine, Tangail District Hospital")).toBeTruthy();
    expect(await screen.findByText(/Reported 3 hours ago by Tangail Facility Desk/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Progress of this case" })).toBeNull(); // no tracker: no case yet
  });

  it("empty and error states", async () => {
    const { unmount } = mount(<DoctorsPage />, base({ "GET /directory/practitioners": () => page([]) }));
    expect(await screen.findByText("No doctors match. Try a wider area.")).toBeTruthy();
    unmount();
    mount(<DoctorsPage />, base({ "GET /directory/practitioners": () => err("provider_unavailable", 503) }));
    expect(await screen.findByText("We could not load doctors.", {}, { timeout: 4000 })).toBeTruthy();
  });

  it("expanding loads that doctor's open times; choosing one and requesting posts the slot, then links to the request", async () => {
    const { calls } = mount(<DoctorsPage />, base({ "GET /practitioners/d1/slots": () => slots(), "POST /appointments": () => json(appt({ id: "new1" }), 201) }));
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Dr. Rahima Khatun/ })); });
    const radio = await screen.findByRole("radio", { name: "26 Nov, 10:30" });
    const request = screen.getByRole("button", { name: "Request this time" }) as HTMLButtonElement;
    expect(request.disabled).toBe(true);
    fireEvent.click(radio);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Request this time" })); });
    expect(await screen.findByText("Request sent")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View your request" }).getAttribute("href")).toBe("/en/appointments/new1");
    const post = calls.find((c) => c.key === "POST /appointments")!;
    expect(JSON.parse(post.body)).toEqual({ slot_id: "sl1" });
    expect(post.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("409 slot_unavailable says it was just taken and refetches the times", async () => {
    let n = 0;
    mount(<DoctorsPage />, base({ "GET /practitioners/d1/slots": () => { n++; return slots(); }, "POST /appointments": () => err("slot_unavailable", 409) }));
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Dr. Rahima Khatun/ })); });
    fireEvent.click(await screen.findByRole("radio", { name: "26 Nov, 10:30" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Request this time" })); });
    expect(await screen.findByText("That time was just taken. Choose another.")).toBeTruthy();
    await waitFor(() => expect(n).toBeGreaterThanOrEqual(2));
  });

  it("signed out (Q-03): browsing works and requesting leads to sign-in", async () => {
    mount(<DoctorsPage />, base({ "GET /practitioners/d1/slots": () => slots() }, false));
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Dr. Rahima Khatun/ })); });
    await screen.findByRole("radio", { name: "26 Nov, 10:30" });
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/en/login?next=%2Fen%2Fdoctors");
    expect(screen.queryByRole("button", { name: "Request this time" })).toBeNull();
  });

  it("only offers times that are available, and says so when there are none", async () => {
    mount(<DoctorsPage />, base({ "GET /practitioners/d1/slots": () => slots("BOOKED") }));
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Dr. Rahima Khatun/ })); });
    expect(await screen.findByText("No times are open right now.")).toBeTruthy();
  });

  it("filters by specialty and area through the API and can clear them", async () => {
    const { calls } = mount(<DoctorsPage />, base());
    await screen.findByText("Dr. Rahima Khatun");
    fireEvent.click(screen.getByText("Filters"));
    fireEvent.change(await screen.findByLabelText("Specialty"), { target: { value: "medicine" } });
    await waitFor(() => expect(calls.some((c) => c.key.includes("/directory/practitioners") && c.key.includes("specialty=medicine"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect((screen.getByLabelText("Specialty") as HTMLSelectElement).value).toBe("");
  });

  it("Bangla: names in Bangla and Bangla digits in the capacity line", async () => {
    nav.pathname = "/bn/doctors";
    mount(<DoctorsPage />, base());
    expect(await screen.findByText("ডা. রহিমা খাতুন")).toBeTruthy();
    expect(await screen.findByText(/৩ ঘণ্টা আগে/)).toBeTruthy();
  });

  it("pre-selects specialty from query params and attaches triage_session_id when requesting a slot", async () => {
    nav.pathname = "/en/doctors";
    nav.search = "specialty=medicine&triage_session_id=sess-999";
    const { calls } = mount(<DoctorsPage />, {
      ...base({
        "GET /practitioners/d1/slots": () => slots(),
        "POST /appointments": () => json(appt({ id: "a-triage", triage_session_id: "sess-999" }), 201),
      }),
    });

    expect(await screen.findByText(/Your confirmed triage summary will be attached/i)).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.key.includes("/directory/practitioners") && c.key.includes("specialty=medicine"))).toBe(true));

    fireEvent.click(await screen.findByRole("button", { name: /Dr\. Rahima Khatun/ }));
    fireEvent.click(await screen.findByRole("radio"));
    fireEvent.click(screen.getByRole("button", { name: "Request this time" }));

    await waitFor(() => expect(calls.some((c) => c.key === "POST /appointments")).toBe(true));
    const post = calls.find((c) => c.key === "POST /appointments")!;
    expect(JSON.parse(post.body).triage_session_id).toBe("sess-999");
  });
});

describe("/reports (G-2, Q-11)", () => {
  beforeEach(() => {
    nav.pathname = "/en/reports";
  });

  it("renders page header, Q-11 notice and empty state", async () => {
    mount(<PatientReportsPage />, {});
    expect(await screen.findByText("My lab reports & documents")).toBeTruthy();
    expect(
      screen.getByText("During the pilot, reports are uploaded and verified by your clinician or facility staff.")
    ).toBeTruthy();
    expect(screen.getByText("Reports your doctor adds will appear here.")).toBeTruthy();
  });

  it("renders patient chart documents, distinguishes draft vs verified, expands extracted values, and audits download link (Review Focus #5)", async () => {
    const { calls } = mount(<PatientReportsPage />, {
      "GET /auth/me": () => json({ ...ME, patient_id: "pat-1" }),
      "GET /patients/pat-1/chart": () =>
        json({
          patient_id: "pat-1",
          encounters: [],
          documents: [
            { id: "doc-1", patient_id: "pat-1", original_filename: "CBC_Blood_Report.pdf", content_type: "application/pdf", size: 2048, state: "VERIFIED", created_at: "2026-11-23T08:00:00Z" },
            { id: "doc-2", patient_id: "pat-1", original_filename: "Pending_Xray.pdf", content_type: "application/pdf", size: 4096, state: "EXTRACTED_UNVERIFIED", created_at: "2026-11-23T09:00:00Z" },
          ],
        }),
      "GET /documents/doc-1/extraction": () =>
        json({
          document_id: "doc-1",
          state: "VERIFIED",
          fields: [{ id: "f1", name: "Hemoglobin", value: "13.4", unit: "g/dL", observed_date: "2026-11-23", lab: "Savar Lab", confidence: 0.98, page: 1, bbox: [0, 0, 0, 0] }],
        }),
      "POST /documents/doc-1/download-link": () =>
        json({ document_id: "doc-1", url: "/api/v1/documents/doc-1/content?token=abc", expires_at: "2026-11-23T08:01:00Z" }),
    });

    expect(await screen.findByText("CBC_Blood_Report.pdf")).toBeTruthy();
    expect(screen.getByText("Pending_Xray.pdf")).toBeTruthy();
    // Draft document carries dashed draft border
    const draftCard = screen.getByText("Pending_Xray.pdf").closest("section");
    expect(draftCard?.className).toContain("border-dashed");

    // Expand extracted values
    fireEvent.click(screen.getAllByRole("button", { name: "View extracted values" })[0]);
    expect(await screen.findByText("Hemoglobin")).toBeTruthy();
    expect(screen.getByText(/13\.4/)).toBeTruthy();

    // Audited download request displays safe notice without navigating to 404
    fireEvent.click(screen.getAllByRole("button", { name: "Open report" })[0]);
    expect(await screen.findByText(/Access logged/i)).toBeTruthy();
    expect(calls.some((c) => c.key === "POST /documents/doc-1/download-link")).toBe(true);
  });

  it("lets a patient upload a PDF/image report and renders AI + RAG summary with positive/negative findings", async () => {
    const aiReport = {
      summary: "Extracted 2 tests: Dengue NS1 Antigen positive and Hemoglobin normal.",
      tests_performed: ["Dengue NS1 Antigen", "Hemoglobin"],
      positive_or_abnormal_findings: [{ test: "Dengue NS1 Antigen", value: "Positive", status: "positive" }],
      negative_or_normal_findings: [{ test: "Hemoglobin", value: "13.8 g/dL", status: "normal" }],
      rag_references: [{ document: "Clinical Lab Handbook", page: 42, relevant_information: "Monitor hydration." }],
      questions_for_doctor: ["Ask your doctor to review the Dengue NS1 Antigen result."],
      missing_information: [],
      requires_clinician_review: true,
      verified: false,
      disclaimer: "AI draft only.",
    };
    let uploaded = false;
    const { calls } = mount(<PatientReportsPage />, {
      "GET /auth/me": () => json({ ...ME, patient_id: "pat-1" }),
      "GET /patients/pat-1/chart": () =>
        json({
          patient_id: "pat-1",
          encounters: [],
          documents: uploaded
            ? [{ id: "doc-new", patient_id: "pat-1", original_filename: "my_lab.pdf", content_type: "application/pdf", size: 1200, state: "EXTRACTED_UNVERIFIED", ai_report: aiReport, positive_count: 1, created_at: "2026-11-24T09:00:00Z" }]
            : [],
        }),
      "POST /documents/": () => {
        uploaded = true;
        return json({ id: "doc-new", patient_id: "pat-1", original_filename: "my_lab.pdf", content_type: "application/pdf", size: 1200, state: "EXTRACTED_UNVERIFIED", ai_report: aiReport, created_at: "2026-11-24T09:00:00Z" }, 201);
      },
      "GET /documents/doc-new/extraction": () =>
        json({ document_id: "doc-new", state: "EXTRACTED_UNVERIFIED", fields: [{ id: "f1", name: "Dengue NS1 Antigen", value: "Positive", unit: "", interpretation: "positive", observed_date: "2026-11-24", lab: "Lab", confidence: 0.95, page: 1, bbox: [0, 0, 0, 0] }], ai_report: aiReport }),
    });

    const input = await screen.findByLabelText("Choose PDF or image");
    const file = new File(["%PDF-1.4"], "my_lab.pdf", { type: "application/pdf" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(calls.some((c) => c.key === "POST /documents/")).toBe(true);
    expect(await screen.findByText("my_lab.pdf")).toBeTruthy();
    // Newly uploaded report shows AI + Medical Book RAG summary immediately and auto-expands extracted values
    expect(await screen.findByText("AI + Medical Book Report Summary")).toBeTruthy();
    expect(screen.getByText(/Clinical Lab Handbook/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide values" })).toBeTruthy();
  });
});

describe("PatientShell unread/pending indicators", () => {
  it("shows unread notification and pending consent indicator dots for signed-in patients", async () => {
    nav.pathname = "/en/home";
    mount(
      <PatientShell>
        <div>Home content</div>
      </PatientShell>,
      {
        "GET /auth/me": () => json({ ...ME, patient_id: "pat-1" }),
        "GET /notifications/": () => page([{ id: "n1", title: "Update", body: "x", read_at: null, created_at: "2026-11-23T08:00:00Z" }]),
        "GET /consents/": () => json({ consents: [], pending_requests: [pendingReq] }),
      },
    );

    expect(await screen.findByText(/1 unread notifications/i)).toBeTruthy();
    expect(await screen.findByText(/1 pending sharing requests/i)).toBeTruthy();
  });
});

describe("/notifications", () => {
  beforeEach(() => {
    nav.pathname = "/en/notifications";
  });

  it("renders empty state when there are no notifications", async () => {
    mount(<NotificationsPage />, {
      "GET /notifications/": () => page([]),
    });
    expect(await screen.findByText("Notifications")).toBeTruthy();
    expect(await screen.findByText("No notifications yet.")).toBeTruthy();
  });

  it("renders notifications and allows marking unread item as read", async () => {
    const { calls } = mount(<NotificationsPage />, {
      "GET /notifications/": () =>
        page([
          {
            id: "notif-1",
            type: "appointment_confirmed",
            title: "Appointment confirmed",
            body: "Dr. Rahima accepted your appointment request for tomorrow at 10:30 AM.",
            state: "UNREAD",
            created_at: "2026-11-23T08:00:00Z",
            read_at: null,
          },
        ]),
      "POST /notifications/notif-1/read": () =>
        json({ id: "notif-1", state: "READ", read_at: "2026-11-23T08:05:00Z" }),
    });

    expect(await screen.findByText("Appointment confirmed")).toBeTruthy();
    expect(
      screen.getByText("Dr. Rahima accepted your appointment request for tomorrow at 10:30 AM.")
    ).toBeTruthy();
    const markBtn = screen.getByRole("button", { name: "Mark as read" });
    fireEvent.click(markBtn);
    await waitFor(() => {
      expect(calls.some((c) => c.key === "POST /notifications/notif-1/read")).toBe(true);
    });
  });
});

describe("/triage (A-12, INV-8)", () => {
  beforeEach(() => {
    nav.pathname = "/en/triage";
  });

  it("renders permission prompt before getUserMedia, without clinical draft preview", async () => {
    mount(<TriagePage />, {});
    expect(await screen.findByText("Before we start")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow microphone" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Type instead" })).toBeTruthy();
    expect(screen.queryByText(/Live Clinical Intake Draft/)).toBeNull();
  });
});

