import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";

const nav = { pathname: "/bn" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => nav.pathname,
  useParams: () => ({ locale: nav.pathname.split("/")[1] }),
}));

import { createApiClient } from "../../api/client";
import { AppProviders, makeQueryClient } from "../../api/queries/provider";
import { PublicHeader } from "../shell/PublicHeader";
import { LandingPage, type LandingClaims } from "./LandingPage";
import { generateMetadata } from "../../app/[locale]/(public)/page";
import { landingKeyDiff, launchProblems } from "../../../scripts/check-content.mjs";
import en from "../../i18n/messages/en.json";
import bn from "../../i18n/messages/bn.json";
import review from "../../content/landing-review.json";

const OFF: LandingClaims = { voice: false, offlineEmergency: false, rulesApproved: false, consentWordingApproved: false, otpIsReal: false };
const ON: LandingClaims = { voice: true, offlineEmergency: true, rulesApproved: true, consentWordingApproved: true, otpIsReal: true };

afterEach(() => { nav.pathname = "/bn"; });

describe.each(["bn", "en"] as const)("landing page (%s)", (locale) => {
  const msgs = locale === "bn" ? bn : en;

  it("has exactly one h1, the headline, and labelled sections in the specified order", () => {
    const { container } = render(<LandingPage locale={locale} claims={OFF} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(msgs.landing.hero.headline);
    const ids = Array.from(container.querySelectorAll("section[id]")).map((s) => s.id);
    expect(ids).toEqual(["why", "how", "features", "safety", "for-doctors"]);
    for (const s of container.querySelectorAll("section[aria-labelledby]")) {
      expect(container.querySelector(`#${s.getAttribute("aria-labelledby")}`), s.id).not.toBeNull();
    }
  });

  it("starts the patient journey from the hero, with the automated-guide notice directly under the button", () => {
    const { container } = render(<LandingPage locale={locale} claims={OFF} />);
    const cta = container.querySelector("#hero-cta")!;
    expect(within(cta as HTMLElement).getByRole("link").getAttribute("href")).toBe(`/${locale}/triage`);
    expect(cta.nextElementSibling?.textContent).toBe(msgs.patient.automatedGuideNotice);
  });

  it("names voice and the text path only where the deployment has voice (Q-05)", () => {
    const headings = (c: HTMLElement) => Array.from(c.querySelectorAll("h3")).map((h) => h.textContent);
    const { container, rerender } = render(<LandingPage locale={locale} claims={OFF} />);
    expect(headings(container)).not.toContain(msgs.landing.features.tiles.voice.title);
    expect(headings(container)).toContain(msgs.landing.features.tiles.typed.title);
    expect(container.querySelector('a[href$="mode=voice"]')).toBeNull();
    rerender(<LandingPage locale={locale} claims={ON} />);
    expect(container.querySelector('#hero-cta a[href$="/triage?mode=voice"]')).not.toBeNull();
    expect(container.querySelector('#hero-cta a[href$="/triage?mode=text"]')?.textContent).toBe(msgs.patient.typeInstead);
    expect(headings(container)).toContain(msgs.landing.features.tiles.voice.title);
    expect(headings(container)).not.toContain(msgs.landing.features.tiles.typed.title);
  });

  it("omits the offline emergency tile unless offline emergency mode is enabled (Q-09)", () => {
    const { container, rerender } = render(<LandingPage locale={locale} claims={OFF} />);
    const tile = (c: HTMLElement) => Array.from(c.querySelectorAll("h3")).map((h) => h.textContent);
    expect(tile(container)).not.toContain(msgs.landing.features.tiles.emergency.title);
    rerender(<LandingPage locale={locale} claims={ON} />);
    expect(tile(container)).toContain(msgs.landing.features.tiles.emergency.title);
  });

  it("publishes a safety statement only when its condition is met (Q-06, Q-07, A-02)", () => {
    const { container, rerender } = render(<LandingPage locale={locale} claims={OFF} />);
    const s = msgs.landing.safety.does;
    for (const shown of [s.automated, s.audit, s.approval]) expect(container.textContent).toContain(shown);
    for (const gated of [s.rules, s.consent, s.code]) expect(container.textContent).not.toContain(gated);
    rerender(<LandingPage locale={locale} claims={ON} />);
    for (const gated of [s.rules, s.consent, s.code]) expect(container.textContent).toContain(gated);
  });

  it("makes no claim the repository cannot support", () => {
    const { container } = render(<LandingPage locale={locale} claims={ON} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\d\s?%|[\d০-৯][\d০-৯,]*\+\s|\bmillion\b/i);
    expect(text).not.toMatch(/AI-powered|revolutionary|certified|government approved|ISO\s?\d|uptime|testimonial|encrypted/i);
    expect(text).not.toMatch(/\b(Q|INV)-\d+/);
    expect(text).not.toMatch(/PLACEHOLDER/);
    expect(text).not.toMatch(/\b999\b|\b16263\b/); // no emergency numbers: Q-06
  });

  it("offers staff sign-in, not sign-up, and has no registration anywhere", () => {
    render(<LandingPage locale={locale} claims={OFF} />);
    const staff = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === `/${locale}/login/staff`);
    expect(staff.length).toBeGreaterThan(0);
    expect(screen.queryByText(/register|sign up|রেজিস্টার/i)).toBeNull();
  });

  it("renders product previews with the real components, inert, with the sample caption as text", () => {
    const { container } = render(<LandingPage locale={locale} claims={OFF} />);
    const preview = container.querySelector("[inert]")!;
    expect(preview.getAttribute("aria-hidden")).toBe("true");
    expect(preview.querySelector("button")).not.toBeNull(); // the real consent buttons, unreachable
    expect(container.textContent).toContain(msgs.landing.hero.sample);
    expect(preview.textContent).not.toContain(msgs.landing.hero.sample);
  });

  it("omits every footer item the repository has no content for", () => {
    const { container } = render(<LandingPage locale={locale} claims={OFF} />);
    const footer = container.querySelector("footer")!;
    const hrefs = Array.from(footer.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.join(" ")).not.toMatch(/privacy|terms|contact|legal|mailto|tel:/i);
    expect(footer.querySelectorAll("nav")).toHaveLength(3);
  });

  it("has no axe violations", async () => {
    const { container } = render(<LandingPage locale={locale} claims={ON} />);
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
  });
});

describe("header on the landing page", () => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
  function header(me: unknown) {
    const client = createApiClient({ baseUrl: "http://localhost/api/v1", fetchImpl: (async () => (me ? json(me) : json({ error: { code: "not_authenticated", message: "x" } }, 401))) as unknown as typeof fetch });
    return render(<AppProviders client={client} queryClient={makeQueryClient()}><PublicHeader /></AppProviders>);
  }

  it("shows the four section links, staff sign-in and no registration to a visitor", async () => {
    nav.pathname = "/en";
    header(null);
    const nav1 = await screen.findByRole("navigation", { name: "Page sections" });
    expect(Array.from(nav1.querySelectorAll("a")).map((a) => a.getAttribute("href"))).toEqual(["#how", "#features", "#safety", "#for-doctors"]);
    expect(screen.getByRole("link", { name: "Staff sign in" })).toBeTruthy();
    expect(screen.queryByText(/register/i)).toBeNull();
  });

  it("shows Go to my home instead of both sign-in links when signed in", async () => {
    nav.pathname = "/en";
    header({ id: "u", email: null, phone: null, display_name: "T", preferred_language: "en", roles: ["patient"], permissions: [], active_facility: null, is_platform_admin: false });
    expect((await screen.findByRole("link", { name: "Go to my home" })).getAttribute("href")).toBe("/en/home");
    expect(screen.queryByRole("link", { name: "Staff sign in" })).toBeNull();
  });

  it("has no section links off the landing page", async () => {
    nav.pathname = "/en/access";
    header(null);
    await screen.findByRole("link", { name: "Staff sign in" });
    expect(screen.queryByRole("navigation", { name: "Page sections" })).toBeNull();
  });
});

describe("metadata and content gate", () => {
  it("gives each locale its own title, description and hreflang alternates", async () => {
    const bnMeta = await generateMetadata({ params: Promise.resolve({ locale: "bn" }) });
    const enMeta = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(bnMeta.title).toBe(bn.landing.meta.title);
    expect(enMeta.title).toBe(en.landing.meta.title);
    expect(enMeta.alternates?.languages).toEqual({ bn: "/bn", en: "/en" });
    expect(enMeta.alternates?.canonical).toBe("/en");
  });

  it("both locales have the same landing keys", () => {
    expect(landingKeyDiff(en, bn)).toEqual({ missingInBn: [], missingInEn: [] });
  });

  it("blocks launch while any copy is an unreviewed draft", () => {
    expect(launchProblems(review).length).toBeGreaterThan(0);
    expect(launchProblems({ bn: { status: "reviewed", clinicalReviewer: "Dr. X" }, en: { status: "reviewed" } })).toEqual([]);
    expect(launchProblems({ bn: { status: "reviewed" }, en: { status: "reviewed" } })).toHaveLength(1);
  });
});
