import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function run(path: string, cookie?: string) {
  const req = new NextRequest(`http://localhost${path}`, cookie ? { headers: { cookie } } : undefined);
  const res = middleware(req);
  return { status: res.status, location: res.headers.get("location") ? new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search : null };
}

afterEach(() => vi.unstubAllEnvs());

describe("middleware (AUTH_RBAC §5.4)", () => {
  it("adds the default locale when missing", () => {
    expect(run("/dashboard", "sessionid=x")).toEqual({ status: 307, location: "/bn/dashboard" });
  });

  it("redirects clinical and admin prefixes to staff sign-in without a session cookie, in every environment", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(run("/en/dashboard")).toEqual({ status: 307, location: "/en/login/staff?next=%2Fen%2Fdashboard" });
    expect(run("/en/facility")).toEqual({ status: 307, location: "/en/login/staff?next=%2Fen%2Ffacility" });
  });

  it("redirects patient prefixes to patient sign-in and keeps the query in next", () => {
    expect(run("/bn/appointments/a1")).toEqual({ status: 307, location: "/bn/login?next=%2Fbn%2Fappointments%2Fa1" });
    expect(run("/bn/home")).toEqual({ status: 307, location: "/bn/login?next=%2Fbn%2Fhome" });
  });

  it("lets a request with a session cookie through (the API is the real check)", () => {
    expect(run("/bn/dashboard", "sessionid=abc").status).toBe(200);
    expect(run("/bn/home", "__Host-sessionid=abc").status).toBe(200);
  });

  it("does not guard public, auth and Q-03 open routes", () => {
    for (const p of ["/bn", "/bn/login", "/bn/login/staff", "/bn/signed-out", "/bn/access", "/bn/triage", "/bn/doctors"]) {
      expect(run(p).status, p).toBe(200);
    }
  });

  it("can be switched off for component tests only", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_GUARD", "off");
    expect(run("/bn/dashboard").status).toBe(200);
  });

  it("ignores the off switch in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_AUTH_GUARD", "off");
    expect(run("/bn/dashboard").status).toBe(307);
  });
});
