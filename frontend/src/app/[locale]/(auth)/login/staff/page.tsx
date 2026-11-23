import React, { Suspense } from "react";
import { StaffSignIn } from "../../../../../components/auth/StaffSignIn";

export default function StaffLoginPage() {
  return (
    <Suspense>
      <StaffSignIn />
    </Suspense>
  );
}
