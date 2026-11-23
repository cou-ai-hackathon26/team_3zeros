"use client";

import React from "react";
import { SiteNav } from "../../../components/SiteNav/SiteNav";

/**
 * FRONTEND §3: Patient route group shell with wayfinding SiteNav.
 * # Q-03: Guest triage vs account-before-triage remains configurable via FEATURE_GUEST_TRIAGE.
 */
export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-route-group="patient">
      <SiteNav area="patient" />
      {children}
    </div>
  );
}
