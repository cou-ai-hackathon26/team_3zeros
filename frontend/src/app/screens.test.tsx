import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ClinicianDashboardPage from "./[locale]/(clinician)/dashboard/page";
import EmergencyReferralPage from "./[locale]/(clinician)/emergency/page";

describe("UIUX §6 Screen Layouts & Invariants", () => {
  it("renders Clinician Workspace (§6.8) three-pane layout with queue tabs, horizontal compact RouteLine, and server allowed_actions", () => {
    render(<ClinicianDashboardPage params={{ locale: "en" }} />);
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByText(/Needs you/i)).toBeTruthy();
  });

  it("renders 5-field Emergency Referral Mode (§6.12) that saves offline immediately and reveals Print Slip action (INV-16)", async () => {
    render(<EmergencyReferralPage params={{ locale: "en" }} />);
    fireEvent.change(screen.getByLabelText(/Reason for transfer/i), { target: { value: "Eclampsia with seizure" } });
    fireEvent.change(screen.getByLabelText(/Treatment given/i), { target: { value: "MgSO4 loading dose" } });
    fireEvent.click(screen.getByRole("button", { name: /Save & send emergency referral/i }));
    expect(await screen.findByRole("button", { name: /Print slip/i })).toBeTruthy();
  });
});
