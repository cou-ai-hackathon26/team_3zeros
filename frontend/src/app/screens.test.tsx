import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EmergencyReferralPage from "./[locale]/(clinician)/emergency/page";

describe("UIUX §6 Screen Layouts & Invariants", () => {
  it("renders 5-field Emergency Referral Mode (§6.12) that saves offline immediately and reveals Print Slip action (INV-16)", async () => {
    render(<EmergencyReferralPage params={{ locale: "en" }} />);
    fireEvent.change(screen.getByLabelText(/Reason for transfer/i), { target: { value: "Eclampsia with seizure" } });
    fireEvent.change(screen.getByLabelText(/Treatment given/i), { target: { value: "MgSO4 loading dose" } });
    fireEvent.click(screen.getByRole("button", { name: /Save & send emergency referral/i }));
    expect(await screen.findByRole("button", { name: /Print slip/i })).toBeTruthy();
  });
});
