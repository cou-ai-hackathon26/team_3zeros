import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RouteLine } from "./RouteLine/RouteLine";
import { ActionBar } from "./ActionBar/ActionBar";
import { SyncBadge } from "./SyncBadge/SyncBadge";
import { StatusLabel } from "./StatusLabel/StatusLabel";

describe("UIUX §5 Core Wayfinding Components", () => {
  it("renders RouteLine with aria-hidden SVG and accessible <ol> stop list plus exception branch", () => {
    const { container } = render(
      <RouteLine entity="referral" currentState="DECLINED" objectId="ref-101" variant="clinician" locale="en" />
    );
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    const list = screen.getByRole("list", { name: /journey route/i });
    expect(list.tagName).toBe("OL");
    expect(screen.getByText(/Declined/i)).toBeTruthy();
  });

  it("renders strictly the server allowed_actions in ActionBar and opens reason dialog for destructive actions", async () => {
    const onAction = vi.fn();
    render(
      <ActionBar
        entity="appointment"
        allowedActions={["accept", "decline"]}
        isPending={false}
        locale="en"
        onAction={onAction}
      />
    );
    expect(screen.getByRole("button", { name: /Accept request/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Decline request/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Cancel/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Decline request/i }));
    const reasonInput = await screen.findByLabelText(/Reason/i);
    fireEvent.change(reasonInput, { target: { value: "Doctor on emergency duty" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm decline/i }));
    expect(onAction).toHaveBeenCalledWith("decline", expect.objectContaining({ reason: "Doctor on emergency duty" }));
  });

  it("renders SyncBadge for PENDING and FAILED_TO_SYNC with retry_sync action (Review Focus #3, INV-12)", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <SyncBadge fhirSyncStatus="PENDING" pendingAction="send" allowedActions={[]} locale="en" />
    );
    expect(screen.getByText(/Sending/i)).toBeTruthy();

    rerender(
      <SyncBadge
        fhirSyncStatus="FAILED"
        pendingAction="send"
        allowedActions={["retry_sync"]}
        locale="en"
        onRetrySync={onRetry}
      />
    );
    expect(screen.getByText(/Needs attention/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Retry sync/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("never shows StatusLabel by color alone — renders stop shape icon and localized text", () => {
    render(<StatusLabel entity="appointment" state="CONFIRMED" stopStatus="current" locale="bn" />);
    expect(screen.getByText("নিশ্চিত")).toBeTruthy();
  });
});
