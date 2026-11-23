/**
 * Wayfinding Route Stop & Exception Branch Mapping (FRONTEND §6, UIUX_DESIGN §3.1 & §5).
 */

export type RouteEntity = "appointment" | "referral" | "triage_session";
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
