import { describe, expect, it } from "vitest";
import { getActionDefinition } from "./actions";
import { computeRouteView, shouldAnimateRouteAdvance } from "./routes";

describe("FRONTEND §6 Action Registry & Route Stop Mapping", () => {
  it("maps every user-callable MASTERPLAN §5.1 appointment action and requires reason on decline", () => {
    const decline = getActionDefinition("appointment", "decline");
    expect(decline.requiresReason).toBe(true);
    expect(decline.confirmationStyle).toBe("destructive");
    expect(getActionDefinition("appointment", "propose_alternate").requiresAlternateSlot).toBe(true);
    expect(() => getActionDefinition("appointment", "invented_action")).toThrow(/Unconfigured action/);
  });

  it("maps every user-callable MASTERPLAN §5.2 referral action including FHIR-gated actions", () => {
    expect(getActionDefinition("referral", "send").fhirGated).toBe(true);
    expect(getActionDefinition("referral", "record_outcome").fhirGated).toBe(true);
    expect(getActionDefinition("referral", "close_with_exception").requiresReason).toBe(true);
  });

  it("renders main stops and branches off for terminal exception states (DECLINED, CANCELLED, FAILED_TO_SYNC)", () => {
    const normal = computeRouteView("referral", "SENT");
    expect(normal.exceptionBranch).toBeNull();
    expect(normal.stops.find((s) => s.state === "SENT")?.status).toBe("current");
    expect(normal.stops.find((s) => s.state === "DRAFT")?.status).toBe("completed");

    const declined = computeRouteView("referral", "DECLINED");
    expect(declined.exceptionBranch).toEqual({
      state: "DECLINED",
      labelKey: "state.referral.DECLINED",
      fromState: "SENT",
      tone: "exception",
    });
  });

  it("animates route forward only when server state is newer than sessionStorage memory", () => {
    const mem = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
    };
    expect(shouldAnimateRouteAdvance("ref-1", "DRAFT", fakeStorage)).toBe(false);
    expect(shouldAnimateRouteAdvance("ref-1", "DRAFT", fakeStorage)).toBe(false);
    expect(shouldAnimateRouteAdvance("ref-1", "SENT", fakeStorage)).toBe(true);
    expect(shouldAnimateRouteAdvance("ref-1", "SENT", fakeStorage)).toBe(false);
  });
});
