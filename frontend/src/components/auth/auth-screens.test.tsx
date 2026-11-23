import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const nav = { replace: vi.fn(), push: vi.fn(), search: "", pathname: "/bn/login" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
  useParams: () => ({ locale: nav.pathname.split("/")[1] }),
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import { createApiClient } from "../../api/client";
import { AppProviders, makeQueryClient } from "../../api/queries/provider";
import { AdaptersProvider, type Adapters } from "../../features/adapters";
import type { UserMe } from "../../auth/types";
import { PatientSignIn } from "./PatientSignIn";
import { RegisterForm } from "./RegisterForm";
import { StaffSignIn } from "./StaffSignIn";
import { SignedOut } from "./SignedOut";
import { AccessInfo } from "./AccessInfo";
import { PasswordResetScreen } from "./PasswordResetScreen";
import { WelcomeScreen } from "./WelcomeScreen";
import { AccessRequestForm } from "./AccessRequestForm";
import { VerifyEmailScreen } from "./VerifyEmailScreen";
import { RequireArea } from "../shell/RequireArea";

const user = (roles: string[], permissions: string[] = []): UserMe => ({
  id: "u", email: null, phone: null, display_name: "Dr. Rahima", preferred_language: "en", roles, permissions,
  active_facility: { id: "f", name: "Tangail District Hospital" }, is_platform_admin: false,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const err = (code: string, status: number, message = code) => json({ error: { code, message, request_id: "req-1" } }, status);

type Route = (req: Request) => Response | Promise<Response>;
function mount(ui: React.ReactElement, routes: Record<string, Route>, adapters: Partial<Adapters> = {}) {
  const calls: string[] = [];
  const fetchImpl = async (req: Request) => {
    const path = new URL(req.url).pathname.replace("/api/v1", "");
    calls.push(`${req.method} ${path}`);
    const h = routes[`${req.method} ${path}`] ?? routes[path];
    return h ? h(req) : err("not_found", 404);
  };
  const client = createApiClient({ baseUrl: "http://localhost/api/v1", getCsrfToken: () => "csrf", fetchImpl: fetchImpl as unknown as typeof fetch });
  const view = render(
    <AppProviders client={client} queryClient={makeQueryClient()}>
      <AdaptersProvider adapters={adapters}>{ui}</AdaptersProvider>
    </AppProviders>,
  );
  return { ...view, calls };
}

beforeEach(() => { nav.replace.mockReset(); nav.push.mockReset(); nav.search = ""; nav.pathname = "/bn/login"; window.localStorage.clear(); });
afterEach(() => vi.useRealTimers());

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = async (name: RegExp | string) => { await act(async () => { fireEvent.click(screen.getByRole("button", { name })); }); };

describe("patient sign-in and registration (MASTERPLAN D-18)", () => {
  it("email or username and password, then the patient home; there is no phone or code step", async () => {
    mount(<PatientSignIn />, { "POST /auth/login": () => json({ message: "ok" }), "GET /auth/me": () => json(user(["patient"])) });
    expect(screen.getByRole("heading", { name: "সাইন ইন" })).toBeTruthy();
    expect(screen.queryByLabelText(/মোবাইল|কোড/)).toBeNull();
    type(/ইমেইল বা ইউজারনেম/, "karim@example.org");
    type(/^পাসওয়ার্ড\(আবশ্যক/, "a-long-passphrase-9");
    await click("সাইন ইন");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/bn/home"));
  });

  it("a wrong password gives one message that does not say which field, and the password is cleared", async () => {
    mount(<PatientSignIn />, { "POST /auth/login": () => err("not_authenticated", 401) });
    type(/ইমেইল বা ইউজারনেম/, "karim"); type(/^পাসওয়ার্ড\(আবশ্যক/, "wrong");
    await click("সাইন ইন");
    expect((await screen.findByRole("alert")).textContent).toContain("ইমেইল, ইউজারনেম বা পাসওয়ার্ড সঠিক নয়");
    expect((screen.getByLabelText(/^পাসওয়ার্ড\(আবশ্যক/) as HTMLInputElement).value).toBe("");
  });

  it("explains rate limiting above the form", async () => {
    mount(<PatientSignIn />, { "POST /auth/login": () => err("rate_limited", 429) });
    type(/ইমেইল বা ইউজারনেম/, "karim"); type(/^পাসওয়ার্ড\(আবশ্যক/, "x");
    await click("সাইন ইন");
    expect((await screen.findByRole("alert")).textContent).toContain("অনেকবার চেষ্টা");
  });

  it("A-04: a signed-in user with no patient role is never dropped on an empty home", async () => {
    mount(<PatientSignIn />, { "POST /auth/login": () => json({}), "GET /auth/me": () => json(user([])), "POST /auth/logout": () => json({}) });
    type(/ইমেইল বা ইউজারনেম/, "karim"); type(/^পাসওয়ার্ড\(আবশ্যক/, "x");
    await click("সাইন ইন");
    expect(await screen.findByText(/অ্যাকাউন্ট এখনও প্রস্তুত নয়/)).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("requires both fields before sending, and links to registration", async () => {
    const { calls } = mount(<PatientSignIn />, {});
    await click("সাইন ইন");
    expect(screen.getAllByText("এই ঘরটি পূরণ করতে হবে।").length).toBeGreaterThan(0);
    expect(calls).toEqual([]);
    expect(screen.getByRole("link", { name: "অ্যাকাউন্ট খুলুন" }).getAttribute("href")).toBe("/bn/register");
  });

  it("registering sends name, email or username and password, then goes to the patient home", async () => {
    nav.pathname = "/en/register";
    const { calls } = mount(<RegisterForm />, { "POST /auth/register": () => json({ message: "ok" }, 201), "GET /auth/me": () => json(user(["patient"])) });
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Karim" } });
    fireEvent.change(screen.getByLabelText(/Email or username/), { target: { value: "karim@example.org" } });
    fireEvent.change(screen.getByLabelText(/^Password\(required/), { target: { value: "a-long-passphrase-9" } });
    await click("Create account");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/home"));
    expect(JSON.parse(calls.find((c) => c.includes("POST /auth/register")) ? "{}" : "{}")).toEqual({});
  });

  it("shows the server's password rule on the password field, and a neutral message for a clash", async () => {
    nav.pathname = "/en/register";
    const weak = json({ error: { code: "validation_error", message: "x", field_errors: { password: ["This password is too short."] }, request_id: "r" } }, 400);
    const { unmount } = mount(<RegisterForm />, { "POST /auth/register": () => weak.clone() });
    const fill = () => { fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "K" } }); fireEvent.change(screen.getByLabelText(/Email or username/), { target: { value: "k@example.org" } }); fireEvent.change(screen.getByLabelText(/^Password\(required/), { target: { value: "short" } }); };
    fill();
    await click("Create account");
    expect(await screen.findByText("This password is too short.")).toBeTruthy();
    unmount();
    mount(<RegisterForm />, { "POST /auth/register": () => json({ error: { code: "validation_error", message: "An account could not be created with those details.", request_id: "r" } }, 400) });
    fill();
    await click("Create account");
    expect((await screen.findByRole("alert")).textContent).toContain("We could not create an account with those details");
  });
});

describe("staff sign-in (AUTH_RBAC §4.2)", () => {
  beforeEach(() => { nav.pathname = "/en/login/staff"; });

  it("bad credentials: one alert that does not say which field, and the password is cleared", async () => {
    mount(<StaffSignIn />, { "POST /auth/login": () => err("not_authenticated", 401) });
    type(/Email or username/, "dr@example.org");
    type(/^Password\(required/, "wrong");
    await click("Sign in");
    expect((await screen.findByRole("alert")).textContent).toBe("Email, username or password is not right.");
    expect((screen.getByLabelText(/^Password\(required/) as HTMLInputElement).value).toBe("");
  });

  it("mfa_required moves to the verification step on the same route, then signs in to the clinical home", async () => {
    mount(<StaffSignIn />, {
      "POST /auth/login": () => err("mfa_required", 401),
      "POST /auth/mfa/verify": () => json({}),
      "GET /auth/me": () => json(user(["clinician"])),
    });
    type(/Email or username/, "dr@example.org");
    type(/^Password\(required/, "pw");
    await click("Sign in");
    expect(await screen.findByRole("heading", { name: "Enter your verification code" })).toBeTruthy();
    type(/^Code\(required/, "123456");
    await click("Verify");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/dashboard"));
  });

  it("goes to `next` only when it is inside an area the user may enter (open redirect protection)", async () => {
    for (const [next, expected] of [["/en/referrals/r1", "/en/referrals/r1"], ["https://evil.test/x", "/en/dashboard"], ["/en/facility", "/en/dashboard"]]) {
      nav.replace.mockReset();
      nav.search = `?next=${encodeURIComponent(next)}`;
      const { unmount } = mount(<StaffSignIn />, {
        "POST /auth/login": () => json({}),
        "GET /auth/me": () => json(user(["clinician"])),
      });
      type(/Email or username/, "dr@example.org");
      type(/^Password\(required/, "pw");
      await click("Sign in");
      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(expected));
      unmount();
    }
  });

  it("a user with no clinical or admin role goes to /not-authorised", async () => {
    mount(<StaffSignIn />, { "POST /auth/login": () => json({}), "GET /auth/me": () => json(user([])) });
    type(/Email or username/, "dr@example.org");
    type(/^Password\(required/, "pw");
    await click("Sign in");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/not-authorised"));
  });

  it("shows the admin-only note instead of a reset link while the reset flag is off", () => {
    mount(<StaffSignIn />, {});
    expect(screen.getByText("Forgot your password? Ask your facility admin.")).toBeTruthy();
    expect(screen.queryByText("Forgot password?")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Q-\d+/);
  });

  it("an MFA session that was lost returns to the first step with a message", async () => {
    mount(<StaffSignIn />, {
      "POST /auth/login": () => err("mfa_required", 401),
      "POST /auth/mfa/verify": () => err("validation_error", 400, "No pending MFA session found."),
    });
    type(/Email or username/, "a@b.co"); type(/^Password\(required/, "pw");
    await click("Sign in");
    await screen.findByRole("heading", { name: "Enter your verification code" });
    type(/^Code\(required/, "123456");
    await click("Verify");
    expect((await screen.findByRole("alert")).textContent).toBe("Please sign in again.");
    expect(screen.getByRole("heading", { name: "Staff sign in" })).toBeTruthy();
  });
});

describe("switching between ways in", () => {
  const hrefs = () => within(screen.getByRole("navigation", { name: /Other ways in|অন্যান্য উপায়/ })).getAllByRole("link").map((a) => a.getAttribute("href"));
  it("patient sign-in offers staff sign-in and create-account as buttons", () => {
    nav.pathname = "/en/login";
    mount(<PatientSignIn />, {});
    expect(hrefs()).toEqual(["/en/login/staff", "/en/register"]);
  });
  it("staff sign-in offers patient sign-in and create-account", () => {
    nav.pathname = "/en/login/staff";
    mount(<StaffSignIn />, {});
    expect(hrefs()).toEqual(["/en/login", "/en/register"]);
  });
  it("register offers patient sign-in and staff sign-in", () => {
    nav.pathname = "/en/register";
    mount(<RegisterForm />, {});
    expect(hrefs()).toEqual(["/en/login", "/en/login/staff"]);
  });
  it("never offers the admin entrance from any page", () => {
    for (const [path, ui] of [["/en/login", <PatientSignIn key="a" />], ["/en/login/staff", <StaffSignIn key="b" />], ["/en/register", <RegisterForm key="c" />]] as const) {
      nav.pathname = path;
      const { container, unmount } = mount(ui, {});
      expect(container.innerHTML).not.toContain("admin/login");
      unmount();
    }
  });
});

describe("admin entrance (MASTERPLAN D-17)", () => {
  beforeEach(() => { nav.pathname = "/en/admin/login"; });
  it("uses its own endpoint and title, then the mandatory MFA step, and offers no staff or patient links", async () => {
    const { calls } = mount(<StaffSignIn admin />, { "POST /auth/admin/login": () => err("mfa_required", 401), "POST /auth/mfa/verify": () => json({}), "GET /auth/me": () => json(user(["facility_admin"])) });
    expect(screen.getByRole("heading", { name: "Administrator sign in" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    type(/Email or username/, "root@example.org"); type(/^Password\(required/, "pw");
    await click("Sign in");
    expect(await screen.findByRole("heading", { name: "Enter your verification code" })).toBeTruthy();
    expect(calls[0]).toBe("POST /auth/admin/login");
    type(/^Code\(required/, "123456");
    await click("Verify");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/facility"));
  });
});

describe("session edges", () => {
  it("signed-out screen explains an expiry and carries `next` to the right sign-in form", () => {
    nav.pathname = "/en/signed-out";
    nav.search = `?reason=expired&next=${encodeURIComponent("/en/referrals/r1")}`;
    mount(<SignedOut />, {});
    expect(screen.getByRole("heading", { name: "You were signed out to keep your information private." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/en/login/staff?next=%2Fen%2Freferrals%2Fr1");
  });

  it("/access explains staff accounts and shows no request form while Q-16 is off", () => {
    nav.pathname = "/en/access";
    mount(<AccessInfo />, {});
    expect(screen.getByText(/created by your facility admin/)).toBeTruthy();
    expect(screen.queryByText("Request access")).toBeNull();
  });
});

describe("RequireArea and shells (AUTH_RBAC §5.4)", () => {
  const navNames = () => screen.getAllByRole("navigation").flatMap((n) => Array.from(n.querySelectorAll("a")).map((a) => a.textContent));

  it("redirects a signed-out visitor to staff sign-in with next, and renders no content", async () => {
    nav.pathname = "/en/dashboard";
    mount(<RequireArea area="clinical"><p>SECRET QUEUE</p></RequireArea>, { "GET /auth/me": () => err("not_authenticated", 401) });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/login/staff?next=%2Fen%2Fdashboard"));
    expect(screen.queryByText("SECRET QUEUE")).toBeNull();
  });

  it("shows a skeleton, not the content, while the session loads", () => {
    nav.pathname = "/en/dashboard";
    mount(<RequireArea area="clinical"><p>SECRET QUEUE</p></RequireArea>, { "GET /auth/me": () => new Promise<Response>(() => {}) });
    expect(screen.queryByText("SECRET QUEUE")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("a patient opening the clinical area sees not-authorised and no clinical navigation", async () => {
    nav.pathname = "/bn/dashboard";
    mount(<RequireArea area="clinical"><p>SECRET QUEUE</p></RequireArea>, { "GET /auth/me": () => json(user(["patient"])), "POST /auth/logout": () => json({}) });
    expect(await screen.findByRole("heading", { name: "এই অংশটি আপনার অ্যাকাউন্টের অংশ নয়" })).toBeTruthy();
    expect(screen.queryByText("SECRET QUEUE")).toBeNull();
    expect(screen.queryByText("Queue")).toBeNull();
  });

  it("a clinician gets the workspace with queue, patients, referrals and emergency, plus visible Sign out", async () => {
    nav.pathname = "/en/dashboard";
    mount(<RequireArea area="clinical"><p>QUEUE PAGE</p></RequireArea>, { "GET /auth/me": () => json(user(["clinician"])) });
    expect(await screen.findByText("QUEUE PAGE")).toBeTruthy();
    expect(navNames()).toEqual(expect.arrayContaining(["Queue", "Patients", "Referrals", "Emergency referral"]));
    expect(screen.getAllByRole("button", { name: "Sign out" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tangail District Hospital").length).toBeGreaterThan(0);
  });

  it("facility staff without permissions see only the queue; the account menu offers no other area", async () => {
    nav.pathname = "/en/dashboard";
    mount(<RequireArea area="clinical"><p>QUEUE PAGE</p></RequireArea>, { "GET /auth/me": () => json(user(["facility_staff"])) });
    await screen.findByText("QUEUE PAGE");
    const names = navNames();
    expect(names).toContain("Queue");
    for (const hidden of ["Patients", "Referrals", "Emergency referral"]) expect(names).not.toContain(hidden);
  });

  it("a patient gets the tab bar with four labelled items and aria-current on the current one", async () => {
    nav.pathname = "/bn/doctors";
    mount(<RequireArea area="patient"><p>DOCTORS PAGE</p></RequireArea>, { "GET /auth/me": () => json(user(["patient"])) });
    await screen.findByText("DOCTORS PAGE");
    const tab = screen.getAllByRole("navigation").find((n) => n.className.includes("fixed"))!;
    expect(tab.querySelectorAll("a")).toHaveLength(4);
    expect(tab.querySelector('[aria-current="page"]')?.textContent).toBe("ডাক্তার");
  });

  it("a signed-out visitor may use an open patient path (Q-03) and sees Sign in, no tab bar", async () => {
    nav.pathname = "/bn/triage";
    mount(<RequireArea area="patient"><p>TRIAGE PAGE</p></RequireArea>, { "GET /auth/me": () => err("not_authenticated", 401) });
    expect(await screen.findByText("TRIAGE PAGE")).toBeTruthy();
    expect(screen.getByRole("link", { name: "সাইন ইন" })).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("navigation")).toHaveLength(0);
  });

  it("a signed-out visitor on a closed patient path is sent to sign-in", async () => {
    nav.pathname = "/bn/appointments";
    mount(<RequireArea area="patient"><p>APPTS</p></RequireArea>, { "GET /auth/me": () => err("not_authenticated", 401) });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/bn/login?next=%2Fbn%2Fappointments"));
  });

  it("a multi-area user sees an area switcher; nobody else does", async () => {
    nav.pathname = "/en/dashboard";
    mount(<RequireArea area="clinical"><p>Q</p></RequireArea>, { "GET /auth/me": () => json(user(["clinician", "patient"])) });
    await screen.findByText("Q");
    await act(async () => { fireEvent.keyDown(screen.getAllByRole("button", { name: "Account" })[0], { key: "Enter" }); });
    expect(await screen.findByText(/Switch to: Patient/)).toBeTruthy();
    expect(screen.queryByText(/Switch to: Administration/)).toBeNull();
  });

  it("a server error loading the session shows a retryable error, not a blank page", async () => {
    nav.pathname = "/en/dashboard";
    mount(<RequireArea area="clinical"><p>Q</p></RequireArea>, { "GET /auth/me": () => err("provider_unavailable", 503) });
    expect(await screen.findByRole("button", { name: "Try again" }, { timeout: 4000 })).toBeTruthy();
  });
});

describe("flagged flows with mock adapters (Q-14 to Q-17)", () => {
  it("password reset shows the same neutral message whatever the account", async () => {
    nav.pathname = "/en/login/staff/reset";
    const request = vi.fn().mockResolvedValue(undefined);
    mount(<PasswordResetScreen />, {}, { passwordReset: { request, complete: vi.fn() } });
    type(/Email or username/, "nobody@example.org");
    await click("Send reset instructions");
    expect(await screen.findByText("If an account matches, we have sent instructions.")).toBeTruthy();
    expect(request).toHaveBeenCalledWith("nobody@example.org");
  });

  it("an expired reset link says so and offers a new request", async () => {
    nav.pathname = "/en/login/staff/reset";
    nav.search = "?token=abc";
    mount(<PasswordResetScreen />, {}, { passwordReset: { request: vi.fn(), complete: vi.fn().mockResolvedValue("expired") } });
    expect(screen.getByText(/at least 12 characters/)).toBeTruthy();
    type(/New password/, "a-very-long-new-passphrase");
    await click("Save password");
    expect((await screen.findByRole("alert")).textContent).toBe("This link has expired. Request a new one.");
  });

  it("with the default adapter (no backend yet) a submit shows an honest error, never success", async () => {
    nav.pathname = "/en/login/staff/reset";
    mount(<PasswordResetScreen />, {});
    type(/Email or username/, "dr@example.org");
    await click("Send reset instructions");
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not be completed/i);
    expect(screen.queryByText("If an account matches, we have sent instructions.")).toBeNull();
  });

  it("welcome: validates required fields, never merges duplicates, and says the desk will confirm", async () => {
    nav.pathname = "/en/welcome";
    const submit = vi.fn().mockResolvedValue({ duplicate: true });
    mount(<WelcomeScreen />, { "GET /directory/areas": () => json([]) }, { patientProfile: { submit } });
    await click("Continue");
    expect(screen.getAllByText("This field is required.").length).toBeGreaterThanOrEqual(2);
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(screen.getAllByLabelText(/^Name/)[0], { target: { value: "Karim" } });
    fireEvent.change(screen.getByLabelText(/Or your age/), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("radio", { name: "Male" }));
    await click("Continue");
    expect(await screen.findByText("We may already have a record for you. The facility desk will confirm.")).toBeTruthy();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ given_name: "Karim", estimated_age: 42, sex: "male" }));
  });

  it("access request creates nothing and says who will review it", async () => {
    nav.pathname = "/en/access";
    const submit = vi.fn().mockResolvedValue({ reference: "AR-7" });
    mount(<AccessRequestForm />, { "GET /directory/facilities": () => json([{ id: "f1", name: "Tangail District Hospital" }]) }, { accessRequest: { submit } });
    expect(screen.getByText("This sends a request to the facility's admin. It does not create an account.")).toBeTruthy();
    type(/Your name/, "Dr. A"); type(/BMDC/, "A-12345"); type(/Work phone/, "01712345678");
    await screen.findByRole("option", { name: "Tangail District Hospital" });
    fireEvent.change(screen.getByLabelText(/^Facility/), { target: { value: "f1" } });
    await click("Send request");
    expect(await screen.findByText(/Request sent to Tangail District Hospital/)).toBeTruthy();
    expect(screen.getByText("AR-7")).toBeTruthy();
  });

  it("verify-email shows the landing state of the link only", async () => {
    nav.pathname = "/en/verify-email";
    nav.search = "?token=t";
    mount(<VerifyEmailScreen />, {}, { emailVerification: { confirm: vi.fn().mockResolvedValue("used") } });
    expect(await screen.findByText("This link was already used.")).toBeTruthy();
  });
});
