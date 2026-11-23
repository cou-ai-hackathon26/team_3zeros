import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

describe("patient sign-in (AUTH_RBAC §4.1)", () => {
  it("phone → code → signed in, then goes to the patient home", async () => {
    mount(<PatientSignIn />, {
      "POST /auth/otp/request": () => json({ message: "sent" }),
      "POST /auth/otp/verify": () => json({ message: "ok" }),
      "GET /auth/me": () => json(user(["patient"])),
    });
    expect(screen.getByRole("heading", { name: "মোবাইল নম্বর দিয়ে সাইন ইন করুন" })).toBeTruthy();
    type(/মোবাইল নম্বর/, "০১৭১২৩৪৫৬৭৮");
    await click("কোড পাঠান");
    expect(await screen.findByRole("heading", { name: "কোডটি লিখুন" })).toBeTruthy();
    expect(screen.getByText(/০১•••••৫৬৭৮/)).toBeTruthy();
    expect(document.activeElement?.tagName).toBe("H1"); // focus moves to the new step
    const code = screen.getByLabelText(/কোড/) as HTMLInputElement;
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    type(/কোড/, "123456");
    await click("সাইন ইন");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/bn/home"));
  });

  it("shows a wrong code inline, clears the field, and keeps resend disabled with a countdown", async () => {
    mount(<PatientSignIn />, {
      "POST /auth/otp/request": () => json({}),
      "POST /auth/otp/verify": () => err("validation_error", 400),
    });
    type(/Mobile|মোবাইল/, "01712345678");
    await click(/কোড পাঠান|Send code/);
    await screen.findByText(/01•••••5678/);
    type(/কোড/, "000000");
    await click("সাইন ইন");
    expect(await screen.findByText("কোডটি সঠিক নয় অথবা মেয়াদ শেষ হয়েছে।")).toBeTruthy();
    expect((screen.getByLabelText(/কোড/) as HTMLInputElement).value).toBe("");
    const resend = screen.getByRole("button", { name: /30 সেকেন্ড|৩০ সেকেন্ড|30/ }) as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
  });

  it("explains rate limiting and offline failures above the form", async () => {
    mount(<PatientSignIn />, { "POST /auth/otp/request": () => err("rate_limited", 429) });
    type(/মোবাইল/, "01712345678");
    await click("কোড পাঠান");
    expect((await screen.findByRole("alert")).textContent).toContain("অনেকবার চেষ্টা");
  });

  it("A-04: a signed-in user with no patient role is never dropped on an empty home", async () => {
    mount(<PatientSignIn />, {
      "POST /auth/otp/request": () => json({}),
      "POST /auth/otp/verify": () => json({}),
      "GET /auth/me": () => json(user([])),
      "POST /auth/logout": () => json({}),
    });
    type(/মোবাইল/, "01712345678");
    await click("কোড পাঠান");
    await screen.findByText(/01•••••5678/);
    type(/কোড/, "123456");
    await click("সাইন ইন");
    expect(await screen.findByText(/অ্যাকাউন্ট এখনও প্রস্তুত নয়/)).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "সাইন আউট" })).toBeTruthy();
  });

  it("requires a phone number before sending", async () => {
    const { calls } = mount(<PatientSignIn />, {});
    await click("কোড পাঠান");
    expect(screen.getByText("এই ঘরটি পূরণ করতে হবে।")).toBeTruthy();
    expect(calls).toEqual([]);
  });
});

describe("staff sign-in (AUTH_RBAC §4.2)", () => {
  beforeEach(() => { nav.pathname = "/en/login/staff"; });

  it("bad credentials: one alert that does not say which field, and the password is cleared", async () => {
    mount(<StaffSignIn />, { "POST /auth/login": () => err("not_authenticated", 401) });
    type(/Email or phone/, "dr@example.org");
    type(/^Password/, "wrong");
    await click("Sign in");
    expect((await screen.findByRole("alert")).textContent).toBe("Email, phone or password is not right.");
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe("");
  });

  it("mfa_required moves to the verification step on the same route, then signs in to the clinical home", async () => {
    mount(<StaffSignIn />, {
      "POST /auth/login": () => err("mfa_required", 401),
      "POST /auth/mfa/verify": () => json({}),
      "GET /auth/me": () => json(user(["clinician"])),
    });
    type(/Email or phone/, "dr@example.org");
    type(/^Password/, "pw");
    await click("Sign in");
    expect(await screen.findByRole("heading", { name: "Enter your verification code" })).toBeTruthy();
    type(/Code/, "123456");
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
      type(/Email or phone/, "dr@example.org");
      type(/^Password/, "pw");
      await click("Sign in");
      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(expected));
      unmount();
    }
  });

  it("a user with no clinical or admin role goes to /not-authorised", async () => {
    mount(<StaffSignIn />, { "POST /auth/login": () => json({}), "GET /auth/me": () => json(user([])) });
    type(/Email or phone/, "dr@example.org");
    type(/^Password/, "pw");
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
    type(/Email or phone/, "a@b.co"); type(/^Password/, "pw");
    await click("Sign in");
    await screen.findByRole("heading", { name: "Enter your verification code" });
    type(/Code/, "123456");
    await click("Verify");
    expect((await screen.findByRole("alert")).textContent).toBe("Please sign in again.");
    expect(screen.getByRole("heading", { name: "Staff sign in" })).toBeTruthy();
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
    type(/Email or phone/, "nobody@example.org");
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
    type(/Email or phone/, "dr@example.org");
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
