import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TriageSummaryForClinician } from "./TriageSummaryForClinician";

const summary = {
  patient_words: "I have had a fever for three days",
  structured_fields: {
    chief_complaint: "Fever", duration: "3 days", severity: "Moderate",
    report: {
      conversation_summary: { overview: "o", missing_information: [] },
      health_assessment: {
        primary_concern: "Fever", possible_explanations: [], triage_level: "EMERGENCY" as const, triage_reasoning: "r",
        medical_evidence: [], recommended_actions: [], warning_signs: ["Stiff neck"], recommended_specialization: "General Medicine",
        follow_up_guidance: "", emergency_instructions: "Call 999 now.", missing_information: [], requires_clinician_review: true, disclaimer: "d",
      },
    },
  },
};

describe("TriageSummaryForClinician", () => {
  it("shows the patient's words, the fields and the AI assessment as a draft", () => {
    render(<TriageSummaryForClinician summary={summary} locale="en" />);
    expect(screen.getByText(/fever for three days/)).toBeInTheDocument();
    expect(screen.getByText("3 days")).toBeInTheDocument();
    expect(screen.getByText(/not a diagnosis/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Stiff neck/)).toBeInTheDocument();
    expect(screen.getByText("A clinician should review this report.")).toBeInTheDocument();
  });

  it("still works when there is no AI report, and renders nothing without a summary", () => {
    const { container, rerender } = render(<TriageSummaryForClinician summary={{ patient_words: "cough", structured_fields: { chief_complaint: "Cough" } }} locale="en" />);
    expect(screen.getByText("Cough")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(<TriageSummaryForClinician summary={null} locale="en" />);
    expect(container).toBeEmptyDOMElement();
  });
});
