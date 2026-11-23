/**
 * Route stop, exception branch and handover holder mapping
 * (FRONTEND §6, redesign/DESIGN_SYSTEM.md §6.1).
 */

export type RouteEntity = "appointment" | "referral" | "triage_session" | "ed_visit";
export type StopStatus = "completed" | "current" | "upcoming";

export interface RouteStop {
  state: string;
  labelKey: string;
  status: StopStatus;
}

export interface RouteExceptionBranch {
  state: string;
  labelKey: string;
  fromState: string;
  tone: "exception" | "emergency";
}

export interface RouteView {
  entity: RouteEntity;
  stops: RouteStop[];
  exceptionBranch: RouteExceptionBranch | null;
}

const MAIN_STOPS: Record<RouteEntity, string[]> = {
  appointment: [
    "REQUESTED",
    "CONFIRMED",
    "COMPLETED",
  ],
  referral: [
    "DRAFT",
    "AWAITING_PATIENT_CONSENT",
    "READY_FOR_SENDER_APPROVAL",
    "APPROVED_BY_SENDER",
    "SENT",
    "ACKNOWLEDGED_BY_RECEIVER",
    "IN_PROGRESS",
    "OUTCOME_RETURNED",
    "CLOSED",
  ],
  triage_session: [
    "CREATED",
    "ACTIVE",
    "SUMMARY_PENDING_REVIEW",
    "CONFIRMED_BY_PATIENT",
  ],
  ed_visit: [
    "ARRIVED",
    "TRIAGED",
    "UNDER_CARE",
    "DISCHARGED",
  ],
};

/**
 * Maps intermediate or side states onto the main route line stop they belong to
 * or branches them off as an exception end-cap (UIUX §5 RouteLine).
 */
const INLINE_STATE_ALIASES: Record<RouteEntity, Record<string, string>> = {
  appointment: {
    ALTERNATE_SLOT_PROPOSED: "REQUESTED",
    PATIENT_ACCEPTED: "REQUESTED",
  },
  referral: {
    OUTCOME_RECORDED: "OUTCOME_RETURNED",
  },
  triage_session: {
    PAUSED: "ACTIVE",
  },
  ed_visit: {},
};

const EXCEPTION_BRANCHES: Record<RouteEntity, Record<string, { fromState: string; tone: "exception" | "emergency" }>> = {
  appointment: {
    DECLINED: { fromState: "REQUESTED", tone: "exception" },
    EXPIRED: { fromState: "REQUESTED", tone: "exception" },
    CANCELLED: { fromState: "REQUESTED", tone: "exception" },
    NO_SHOW: { fromState: "CONFIRMED", tone: "exception" },
  },
  referral: {
    ESCALATED: { fromState: "SENT", tone: "emergency" },
    DECLINED: { fromState: "SENT", tone: "exception" },
    CANCELLED: { fromState: "DRAFT", tone: "exception" },
    EXPIRED: { fromState: "AWAITING_PATIENT_CONSENT", tone: "exception" },
    FAILED_TO_SYNC: { fromState: "APPROVED_BY_SENDER", tone: "exception" },
  },
  triage_session: {
    EMERGENCY_PATHWAY: { fromState: "ACTIVE", tone: "emergency" },
    ENDED_BY_PATIENT: { fromState: "ACTIVE", tone: "exception" },
    ABANDONED: { fromState: "ACTIVE", tone: "exception" },
  },
  ed_visit: {
    ADMITTED: { fromState: "UNDER_CARE", tone: "exception" },
    TRANSFERRED: { fromState: "UNDER_CARE", tone: "emergency" },
    LEFT: { fromState: "UNDER_CARE", tone: "exception" },
    DIED: { fromState: "UNDER_CARE", tone: "exception" },
  },
};

export function computeRouteView(entity: RouteEntity, currentState: string): RouteView {
  const mainList = MAIN_STOPS[entity];
  const branchDef = EXCEPTION_BRANCHES[entity]?.[currentState];
  const mappedCurrent = branchDef
    ? branchDef.fromState
    : INLINE_STATE_ALIASES[entity]?.[currentState] ?? currentState;

  const currentIdx = Math.max(0, mainList.indexOf(mappedCurrent));

  const stops: RouteStop[] = mainList.map((stateCode, idx) => {
    let status: StopStatus = "upcoming";
    if (idx < currentIdx) {
      status = "completed";
    } else if (idx === currentIdx) {
      status = "current";
    }
    const effectiveState = idx === currentIdx && INLINE_STATE_ALIASES[entity]?.[currentState]
      ? currentState
      : stateCode;

    return {
      state: effectiveState,
      labelKey: `state.${entity}.${effectiveState}`,
      status,
    };
  });

  const exceptionBranch: RouteExceptionBranch | null = branchDef
    ? {
        state: currentState,
        labelKey: `state.${entity}.${currentState}`,
        fromState: branchDef.fromState,
        tone: branchDef.tone,
      }
    : null;

  return {
    entity,
    stops,
    exceptionBranch,
  };
}

/**
 * Who holds the case: the actor who must act next, taken from the Actor
 * column of MASTERPLAN §5. `system` means the platform acts without a person;
 * `none` means nobody (terminal). The tracker never lists states itself.
 */
export type Holder = "patient" | "practitioner" | "sender" | "receiver" | "system" | "none";

const HOLDERS: Record<RouteEntity, Record<string, Holder>> = {
  appointment: {
    REQUESTED: "practitioner",
    ALTERNATE_SLOT_PROPOSED: "patient",
    PATIENT_ACCEPTED: "practitioner",
    CONFIRMED: "practitioner",
    COMPLETED: "none",
    DECLINED: "none",
    EXPIRED: "none",
    CANCELLED: "none",
    NO_SHOW: "none",
  },
  referral: {
    DRAFT: "sender",
    AWAITING_PATIENT_CONSENT: "patient",
    READY_FOR_SENDER_APPROVAL: "sender",
    APPROVED_BY_SENDER: "sender",
    SENT: "receiver",
    ESCALATED: "receiver",
    ACKNOWLEDGED_BY_RECEIVER: "receiver",
    IN_PROGRESS: "receiver",
    OUTCOME_RECORDED: "system",
    OUTCOME_RETURNED: "sender",
    CLOSED: "none",
    DECLINED: "sender",
    CANCELLED: "none",
    EXPIRED: "none",
    FAILED_TO_SYNC: "system",
  },
  triage_session: {
    CREATED: "patient",
    ACTIVE: "patient",
    PAUSED: "patient",
    SUMMARY_PENDING_REVIEW: "patient",
    CONFIRMED_BY_PATIENT: "none",
    EMERGENCY_PATHWAY: "none",
    ENDED_BY_PATIENT: "none",
    ABANDONED: "none",
  },
  ed_visit: {
    ARRIVED: "practitioner",
    TRIAGED: "practitioner",
    UNDER_CARE: "practitioner",
    DISCHARGED: "none",
    ADMITTED: "none",
    TRANSFERRED: "none",
    LEFT: "none",
    DIED: "none",
  },
};

export function holderOf(entity: RouteEntity, state: string): Holder {
  const holder = HOLDERS[entity]?.[state];
  if (!holder) throw new Error(`No holder defined for ${entity}.${state}`);
  return holder;
}

export interface HandoverSegment {
  holder: Holder;
  current: boolean;
  stops: RouteStop[];
}

export interface HandoverView {
  entity: RouteEntity;
  holder: Holder;
  segments: HandoverSegment[];
  exceptionBranch: RouteExceptionBranch | null;
}

/** Groups the route stops into consecutive segments with the same holder. */
export function computeHandoverView(entity: RouteEntity, currentState: string): HandoverView {
  const route = computeRouteView(entity, currentState);
  const segments: HandoverSegment[] = [];
  for (const stop of route.stops) {
    const holder = holderOf(entity, stop.state);
    const last = segments[segments.length - 1];
    if (last && last.holder === holder) last.stops.push(stop);
    else segments.push({ holder, current: false, stops: [stop] });
  }
  const currentSegment = segments.find((seg) => seg.stops.some((s) => s.status === "current"));
  if (currentSegment) currentSegment.current = true;
  return {
    entity,
    holder: holderOf(entity, currentState),
    segments,
    exceptionBranch: route.exceptionBranch,
  };
}

export interface SimpleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STATE_ORDER: Record<string, number> = {
  // Appointment
  REQUESTED: 1,
  ALTERNATE_SLOT_PROPOSED: 2,
  PATIENT_ACCEPTED: 3,
  CONFIRMED: 4,
  COMPLETED: 5,
  // Referral
  DRAFT: 1,
  AWAITING_PATIENT_CONSENT: 2,
  READY_FOR_SENDER_APPROVAL: 3,
  APPROVED_BY_SENDER: 4,
  SENT: 5,
  ESCALATED: 6,
  ACKNOWLEDGED_BY_RECEIVER: 7,
  IN_PROGRESS: 8,
  OUTCOME_RECORDED: 9,
  OUTCOME_RETURNED: 10,
  CLOSED: 11,
  // Triage
  CREATED: 1,
  ACTIVE: 2,
  PAUSED: 2,
  SUMMARY_PENDING_REVIEW: 3,
  CONFIRMED_BY_PATIENT: 4,
  // ED Visit
  ARRIVED: 1,
  TRIAGED: 2,
  UNDER_CARE: 3,
  DISCHARGED: 4,
  ADMITTED: 4,
  TRANSFERRED: 4,
  LEFT: 4,
  DIED: 4,
};

/**
 * FRONTEND §6: The last seen (object id, state) is stored in sessionStorage;
 * the route draws forward only if the server state is newer than previously seen.
 */
export function shouldAnimateRouteAdvance(
  objectId: string,
  currentState: string,
  storage?: SimpleStorage
): boolean {
  const store: SimpleStorage | null =
    storage ?? (typeof window !== "undefined" ? window.sessionStorage : null);
  if (!store) return false;

  const key = `medi_waypoint_route_state:${objectId}`;
  const prev = store.getItem(key);
  store.setItem(key, currentState);

  if (!prev || prev === currentState) {
    return false;
  }

  const prevRank = STATE_ORDER[prev] ?? 0;
  const currRank = STATE_ORDER[currentState] ?? 99;
  return currRank > prevRank;
}
