import React, { Suspense } from "react";
import { notFound } from "next/navigation";
import { PasswordResetScreen } from "../../../../../../components/auth/PasswordResetScreen";
import { FEATURES } from "../../../../../../features/flags";

/** Q-14. With the flag off the route does not exist. */
export default function PasswordResetPage() {
  if (!FEATURES.passwordReset) notFound();
  return (
    <Suspense>
      <PasswordResetScreen />
    </Suspense>
  );
}
