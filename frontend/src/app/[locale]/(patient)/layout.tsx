import React from "react";
import { RequireArea } from "../../../components/shell/RequireArea";

/** Patient area. Q-03 is open, so triage and doctor discovery also work signed out (see isOpenPath). */
export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return <RequireArea area="patient">{children}</RequireArea>;
}
