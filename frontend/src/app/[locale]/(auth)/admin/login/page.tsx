import React, { Suspense } from "react";
import type { Metadata } from "next";
import { StaffSignIn } from "../../../../../components/auth/StaffSignIn";

// The admin entrance is not linked anywhere and must not be indexed (MASTERPLAN D-17). Hiding it is
// only to reduce noise; the real protection is the server-side role check, mandatory MFA and rate limits.
export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Medi Waypoint" };

export default function AdminLoginPage() {
  return (
    <Suspense>
      <StaffSignIn admin />
    </Suspense>
  );
}
