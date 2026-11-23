import { describe, expect, it } from "vitest";
import { getActionDefinition } from "./actions";
import { computeHandoverView, computeRouteView, holderOf, shouldAnimateRouteAdvance } from "./routes";

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

describe("Handover holder map (DESIGN_SYSTEM §6.1, derived from MASTERPLAN §5 actors)", () => {
  const ALL_STATES = {
    appointment: ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW", "ALTERNATE_SLOT_PROPOSED", "PATIENT_ACCEPTED", "DECLINED", "EXPIRED"],
    referral: ["DRAFT", "AWAITING_PATIENT_CONSENT", "READY_FOR_SENDER_APPROVAL", "APPROVED_BY_SENDER", "SENT", "ACKNOWLEDGED_BY_RECEIVER", "IN_PROGRESS", "OUTCOME_RECORDED", "OUTCOME_RETURNED", "CLOSED", "ESCALATED", "DECLINED", "CANCELLED", "EXPIRED", "FAILED_TO_SYNC"],
    triage_session: ["CREATED", "ACTIVE", "PAUSED", "EMERGENCY_PATHWAY", "SUMMARY_PENDING_REVIEW", "CONFIRMED_BY_PATIENT", "ENDED_BY_PATIENT", "ABANDONED"],
  } as const;

  it("assigns a holder to every MASTERPLAN §5 state of every tracked entity", () => {
    for (const [entity, states] of Object.entries(ALL_STATES)) {
      for (const state of states) {
        expect(holderOf(entity as keyof typeof ALL_STATES, state), `${entity}.${state}`).toBeTruthy();
      }
    }
  });

  it("names the actor who must act next", () => {
    expect(holderOf("appointment", "REQUESTED")).toBe("practitioner");
    expect(holderOf("appointment", "ALTERNATE_SLOT_PROPOSED")).toBe("patient");
    expect(holderOf("referral", "AWAITING_PATIENT_CONSENT")).toBe("patient");
    expect(holderOf("referral", "APPROVED_BY_SENDER")).toBe("sender");
    expect(holderOf("referral", "SENT")).toBe("receiver");
    expect(holderOf("referral", "OUTCOME_RECORDED")).toBe("system");
    expect(holderOf("referral", "CLOSED")).toBe("none");
    expect(holderOf("appointment", "DECLINED")).toBe("none");
  });

  it("throws for a state that MASTERPLAN does not define", () => {
    expect(() => holderOf("referral", "INVENTED")).toThrow(/No holder/);
  });

  it("groups the stops of a referral into consecutive holder segments and marks the current holder", () => {
    const view = computeHandoverView("referral", "SENT");
    expect(view.holder).toBe("receiver");
    expect(view.segments.map((s) => s.holder)).toEqual(["sender", "patient", "sender", "receiver", "sender", "none"]);
    expect(view.segments.flatMap((s) => s.stops.map((x) => x.state))).toEqual(
      computeRouteView("referral", "SENT").stops.map((x) => x.state),
    );
    expect(view.segments.filter((s) => s.current)).toHaveLength(1);
    expect(view.segments.find((s) => s.current)?.holder).toBe("receiver");
  });

  it("keeps the exception branch, and a declined referral is held by the sender who must now act", () => {
    const view = computeHandoverView("referral", "DECLINED");
    expect(view.exceptionBranch?.state).toBe("DECLINED");
    expect(view.holder).toBe("sender");
  });
});
