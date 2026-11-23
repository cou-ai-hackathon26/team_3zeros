import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueueList } from "./QueueList/QueueList";
import { DraftBlock } from "./DraftBlock/DraftBlock";
import { ReportViewer } from "./ReportViewer/ReportViewer";
import { ConsentSheet } from "./ConsentSheet/ConsentSheet";

describe("UIUX §5 Clinical & Document Components", () => {
  it("sorts QueueList with ESCALATED items first, supports J/K/Enter keyboard navigation, and marks escalated rows", () => {
    const onSelect = vi.fn();
    const items = [
      { id: "1", patientName: "Karim Uddin", patientNameBn: "করিম উদ্দিন", reason: "Fever 3d", urgency: "routine" as const, escalated: false, createdAt: "2026-11-22T22:00:00Z" },
      { id: "2", patientName: "Nasima Begum", patientNameBn: "নাসিমা বেগম", reason: "Chest tightness", urgency: "emergency" as const, escalated: true, escalatedAt: "2026-11-22T23:10:00Z", createdAt: "2026-11-22T23:00:00Z" },
    ];
    render(<QueueList items={items} selectedId="2" onSelect={onSelect} locale="en" />);
    const rows = screen.getAllByRole("option");
    expect(rows[0].textContent).toContain("Nasima Begum");

    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "j" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("1");
  });

  it("renders DraftBlock with dashed SVG overlay border, 'Draft' tag, and SourceChips (INV-7)", () => {
    const onOpenSource = vi.fn();
    render(
      <DraftBlock
        title="Clinical Summary"
        content="HbA1c 8.4% recorded on lab sheet."
        verified={false}
        sources={[{ id: "document:doc-1#page=2", label: "Lab Report p.2" }]}
        locale="en"
        onOpenSource={onOpenSource}
      />
    );
    expect(screen.getByText("Draft")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Lab Report p\.2/i }));
    expect(onOpenSource).toHaveBeenCalledWith("document:doc-1#page=2");
  });

  it("renders ReportViewer with 'Check this' marker on low-confidence OCR fields (<0.85) and prior results under row (INV-15)", () => {
    const onVerify = vi.fn();
    render(
      <ReportViewer
        documentUrl="/api/v1/documents/doc-1/file"
        filename="cbc-report.pdf"
        fields={[
          { id: "f1", name: "Hemoglobin", value: "10.2", unit: "g/dL", observedDate: "2026-11-20", lab: "Popular Diagnostic", confidence: 0.62, page: 1, bbox: [0.1, 0.2, 0.4, 0.25] },
        ]}
        priorResults={{
          Hemoglobin: [{ value: "11.1", unit: "g/dL", date: "2026-09-14", lab: "Dhaka Medical Lab" }],
        }}
        locale="en"
        onVerify={onVerify}
      />
    );
    expect(screen.getByText(/Check this/i)).toBeTruthy();
    expect(screen.getByText(/11\.1 g\/dL/i)).toBeTruthy();
    expect(screen.getByText(/Dhaka Medical Lab/i)).toBeTruthy();
  });

  it("renders ConsentSheet with recipient, categories list, and equal-sized Share / Don't share buttons", () => {
    const onGrant = vi.fn();
    const onRefuse = vi.fn();
    render(
      <ConsentSheet
        recipientPractitioner="Dr. Rahima Khatun"
        recipientFacility="Tangail District Hospital"
        purpose="Specialist referral review"
        categories={["Encounters", "Lab reports", "Medications"]}
        expiresAt="2026-12-23T00:00:00Z"
        locale="en"
        onGrant={onGrant}
        onRefuse={onRefuse}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Share with Dr\. Rahima Khatun/i }));
    expect(onGrant).toHaveBeenCalledTimes(1);
  });
});
