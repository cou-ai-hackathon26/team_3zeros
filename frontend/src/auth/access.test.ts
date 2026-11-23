import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  AREAS, ROLES, areaOfPath, canEnter, can, hasRole, landingFor, resolveNext, areasOf, isOpenPath,
} from "./access";
import { visibleNav } from "./nav";
import type { UserMe } from "./types";

function user(roles: string[], permissions: string[] = []): UserMe {
  return {
    id: "u", email: null, phone: null, display_name: "T", preferred_language: "en",
    roles, active_facility: null, permissions, is_platform_admin: roles.includes("platform_admin"),
  };
}

describe("roles match MASTERPLAN §4.1", () => {
  it("lists exactly the role codes in the masterplan table", () => {
    const md = fs.readFileSync(path.resolve(__dirname, "../../../MASTERPLAN.md"), "utf8");
    const section = md.slice(md.indexOf("### 4.1 Roles"), md.indexOf("### 4.2 Action matrix"));
    const codes = [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]);
    expect([...ROLES].sort()).toEqual(codes.sort());
  });
});

describe("areas", () => {
  it("maps roles to areas as in AUTH_RBAC §2", () => {
    expect(canEnter(user(["patient"]), "patient")).toBe(true);
    expect(canEnter(user(["patient"]), "clinical")).toBe(false);
    expect(canEnter(user(["clinician"]), "clinical")).toBe(true);
    expect(canEnter(user(["facility_staff"]), "clinical")).toBe(true);
    expect(canEnter(user(["facility_staff"]), "admin")).toBe(false);
    expect(canEnter(user(["facility_admin"]), "admin")).toBe(true);
    expect(canEnter(user(["platform_admin"]), "admin")).toBe(true);
    expect(canEnter(user(["platform_admin"]), "clinical")).toBe(false);
    expect(canEnter(null, "patient")).toBe(false);
    expect(canEnter(user([]), "patient")).toBe(false);
  });

  it("lists several areas for a clinician who is also a patient", () => {
    expect(areasOf(user(["clinician", "patient"]))).toEqual(["patient", "clinical"]);
    expect(AREAS).toEqual(["patient", "clinical", "admin"]);
  });

  it("ignores unknown role strings", () => {
    expect(areasOf(user(["superuser"]))).toEqual([]);
  });

  it("finds the area of a path, ignoring the locale prefix", () => {
    expect(areaOfPath("/bn/dashboard")).toBe("clinical");
    expect(areaOfPath("/en/referrals/abc")).toBe("clinical");
    expect(areaOfPath("/bn/home")).toBe("patient");
    expect(areaOfPath("/en/facility")).toBe("admin");
    expect(areaOfPath("/en/login")).toBeNull();
    expect(areaOfPath("/en")).toBeNull();
  });
});

describe("open paths (Q-03)", () => {
  it("lets signed-out visitors reach triage and doctors only", () => {
    expect(isOpenPath("/triage/session/1")).toBe(true);
    expect(isOpenPath("/doctors")).toBe(true);
    expect(isOpenPath("/appointments")).toBe(false);
    expect(isOpenPath("/home")).toBe(false);
  });
});

describe("landing after sign-in (AUTH_RBAC §4.4)", () => {
  it("goes to the one accessible area's home", () => {
    expect(landingFor(user(["patient"]))).toEqual({ kind: "home", path: "/home" });
    expect(landingFor(user(["clinician"]))).toEqual({ kind: "home", path: "/dashboard" });
    expect(landingFor(user(["facility_staff"]))).toEqual({ kind: "home", path: "/dashboard" });
    expect(landingFor(user(["facility_admin"]))).toEqual({ kind: "home", path: "/facility" });
    expect(landingFor(user(["platform_admin"]))).toEqual({ kind: "home", path: "/facility" });
  });
  it("uses the last used area for multi-area users, else asks", () => {
    const multi = user(["clinician", "patient"]);
    expect(landingFor(multi, "patient")).toEqual({ kind: "home", path: "/home" });
    expect(landingFor(multi, "admin")).toEqual({ kind: "choose" });
    expect(landingFor(multi)).toEqual({ kind: "choose" });
  });
  it("reports no access when there are no roles", () => {
    expect(landingFor(user([]))).toEqual({ kind: "none" });
  });
});

describe("resolveNext prevents open redirects and role confusion", () => {
  const clin = user(["clinician"]);
  it("accepts a same-origin path inside an allowed area", () => {
    expect(resolveNext("/bn/dashboard", clin)).toBe("/bn/dashboard");
    expect(resolveNext("/en/referrals/r1?tab=incoming", clin)).toBe("/en/referrals/r1?tab=incoming");
  });
  it("rejects other origins, protocol-relative and scheme URLs", () => {
    for (const bad of ["https://evil.test/bn/dashboard", "//evil.test/bn/dashboard", "javascript:alert(1)", "/\\evil.test", "bn/dashboard"]) {
      expect(resolveNext(bad, clin), bad).toBeNull();
    }
  });
  it("rejects paths in an area the user cannot enter, and non-area paths", () => {
    expect(resolveNext("/bn/facility", clin)).toBeNull();
    expect(resolveNext("/bn/home", clin)).toBeNull();
    expect(resolveNext("/bn/login", clin)).toBeNull();
    expect(resolveNext(null, clin)).toBeNull();
  });
});

describe("navigation filtered by permissions (AUTH_RBAC §5.3)", () => {
  const ids = (me: UserMe | null, area: "patient" | "clinical" | "admin") => visibleNav(me, area).map((i) => i.id);

  it("clinician sees queue, patients, referrals, ed and emergency", () => {
    expect(ids(user(["clinician"]), "clinical")).toEqual(["queue", "patients", "referrals", "ed", "emergency"]);
  });
  it("facility staff with no permissions see only the queue", () => {
    expect(ids(user(["facility_staff"]), "clinical")).toEqual(["queue"]);
  });
  it("facility staff see referrals with referral.acknowledge, ed with ed.manage, and emergency with emergency.create", () => {
    expect(ids(user(["facility_staff"], ["referral.acknowledge"]), "clinical")).toEqual(["queue", "referrals"]);
    expect(ids(user(["facility_staff"], ["ed.manage"]), "clinical")).toEqual(["queue", "ed"]);
    expect(ids(user(["facility_staff"], ["emergency.create"]), "clinical")).toEqual(["queue", "emergency"]);
  });
  it("shows nothing for an area the user cannot enter", () => {
    expect(ids(user(["patient"]), "clinical")).toEqual([]);
    expect(ids(null, "patient")).toEqual([]);
  });
  it("patient and admin navigation", () => {
    expect(ids(user(["patient"]), "patient")).toEqual(["home", "doctors", "appointments", "reports"]);
    expect(ids(user(["facility_admin"]), "admin")).toEqual(["facility", "schedules", "capacity", "staff"]);
  });
  it("has / hasRole helpers", () => {
    expect(hasRole(user(["clinician"]), "clinician")).toBe(true);
    expect(can(user(["facility_staff"], ["schedule.manage"]), "schedule.manage")).toBe(true);
    expect(can(user(["clinician"]), "schedule.manage")).toBe(false);
  });
});
