import React from "react";
import { RequireArea } from "../../../components/shell/RequireArea";

/** Administration for facility_admin and platform_admin. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireArea area="admin">{children}</RequireArea>;
}
