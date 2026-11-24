import React from "react";
import { RequireArea } from "../../../components/shell/RequireArea";
import { OfflineSyncBar } from "../../../components/offline/OfflineSyncBar";

/** Clinical workspace for clinician and facility_staff. Navigation is filtered by permissions in auth/nav.ts. */
export default function ClinicianLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireArea area="clinical">
      <OfflineSyncBar />
      {children}
    </RequireArea>
  );
}
