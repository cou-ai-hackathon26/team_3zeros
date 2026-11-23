import React, { Suspense } from "react";
import { notFound } from "next/navigation";
import { VerifyEmailScreen } from "../../../../components/auth/VerifyEmailScreen";
import { FEATURES } from "../../../../features/flags";

/** Q-17. With the flag off the route does not exist. */
export default function VerifyEmailPage() {
  if (!FEATURES.emailVerification) notFound();
  return (
    <Suspense>
      <VerifyEmailScreen />
    </Suspense>
  );
}
