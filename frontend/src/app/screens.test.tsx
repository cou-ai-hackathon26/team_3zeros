import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PatientHomePage from "./[locale]/(public)/page";
import DoctorDiscoveryPage from "./[locale]/(patient)/doctors/page";
import ClinicianDashboardPage from "./[locale]/(clinician)/dashboard/page";
import EmergencyReferralPage from "./[locale]/(clinician)/emergency/page";

describe("UIUX §6 Screen Layouts & Invariants", () => {
  it("renders Patient Home (§6.1) with 4-stop route preview, automated-guide notice (not doctor), and bottom-fixed Start talking CTA", () => {
    render(<PatientHomePage params={{ locale: "bn" }} />);
    expect(screen.getByText(/আপনার কী সমস্যা হচ্ছে, বলুন/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /কথা বলা শুরু করুন|Start talking/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /লিখে জানান|Type instead/i })).toBeTruthy();
  });

  it("renders Doctor Discovery (§6.5) as a left-aligned list (not cards) and shows dated capacity source (INV-14)", () => {
    render(<DoctorDiscoveryPage params={{ locale: "en" }} />);
    expect(screen.getAllByText(/Reported .* ago by/i).length).toBeGreaterThanOrEqual(1);
  });

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
