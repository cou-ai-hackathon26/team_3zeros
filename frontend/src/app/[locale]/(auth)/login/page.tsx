import React, { Suspense } from "react";
import { PatientSignIn } from "../../../../components/auth/PatientSignIn";

export default function LoginPage() {
  return (
    <Suspense>
      <PatientSignIn />
    </Suspense>
  );
}
