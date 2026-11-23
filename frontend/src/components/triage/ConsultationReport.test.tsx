import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConsultationReport } from "./ConsultationReport";
import type { ConsultationReport as Report } from "../../api/queries/types";

const base: Report = {
  conversation_summary: { overview: "Three days of fever and sore throat.", missing_information: [] },
  health_assessment: {
    primary_concern: "Fever and sore throat",
    possible_explanations: [{ text: "A viral infection", document: "Davidson's", page: 399 }],
    triage_level: "MODERATE",
    triage_reasoning: "r",
    medical_evidence: [{ document: "Davidson's", page: 399, relevant_information: "Incubation 2-4 days." }],
    recommended_actions: ["See a doctor soon"],
    warning_signs: ["Stiff neck"],
    recommended_specialization: "General Medicine",
    follow_up_guidance: "Return if worse",
    emergency_instructions: null,
    missing_information: ["Exact temperature"],
    requires_clinician_review: false,
    disclaimer: "This AI-generated report is intended for healthcare guidance and triage support.",
  },
};

describe("ConsultationReport", () => {
  it("shows the assessment, labels possibilities as not a diagnosis, and cites document and page", () => {
    render(<ConsultationReport report={base} locale="en" />);
    expect(screen.getByText("Your health assessment")).toBeInTheDocument();
    expect(screen.getByText(/Drafted by AI.*not a diagnosis/)).toBeInTheDocument();
    expect(screen.getByText("Possible explanations (not a diagnosis)")).toBeInTheDocument();
    expect(screen.getByText("A viral infection (Davidson's, page 399)")).toBeInTheDocument();
    expect(screen.getByText("Davidson's, page 399")).toBeInTheDocument();
    expect(screen.getByText(/Moderate: see a doctor/)).toBeInTheDocument();
    expect(screen.getByText(/intended for healthcare guidance/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("puts emergency guidance in an alert and flags clinician review", () => {
    const r: Report = { ...base, health_assessment: { ...base.health_assessment, triage_level: "EMERGENCY", emergency_instructions: "Call 999 now.", requires_clinician_review: true } };
    render(<ConsultationReport report={r} locale="en" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Call 999 now.");
    expect(screen.getByText("A clinician should review this report.")).toBeInTheDocument();
  });

  it("renders in Bangla", () => {
    render(<ConsultationReport report={base} locale="bn" />);
    expect(screen.getByText("আপনার স্বাস্থ্য মূল্যায়ন")).toBeInTheDocument();
  });
});
