/**
 * Real-time WebSocket event listener (MASTERPLAN §6.4, FRONTEND §2).
 * Events carry IDs and states only, never clinical content.
 * On receiving an event, the client invalidates the corresponding TanStack Query keys.
 */

export interface ServerRealtimeEvent {
  type:
    | "appointment.state_changed"
    | "referral.state_changed"
    | "referral.escalated"
    | "document.extraction_ready"
    | "referral.draft_ready"
    | "triage.turn"
    | "triage.emergency"
    | "notification.created";
  id: string;
  state?: string;
  version?: number;
}

export type RealtimeEventHandler = (event: ServerRealtimeEvent) => void;

export function connectRealtimeEvents(params: {
  url?: string;
  onEvent: RealtimeEventHandler;
}): () => void {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") {
    return () => {};
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = params.url ?? `${protocol}//${window.location.host}/ws/events`;
  let socket: WebSocket | null = null;
  let closed = false;

  try {
    socket = new WebSocket(wsUrl);
    socket.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(String(msg.data)) as ServerRealtimeEvent;
        if (parsed && typeof parsed.type === "string") {
          params.onEvent(parsed);
        }
      } catch {
        // Ignore malformed frame
      }
    };
  } catch {
    // Polling and refetch-on-focus remain active fallback (MASTERPLAN §6.4)
  }

  return () => {
    closed = true;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  };
}
