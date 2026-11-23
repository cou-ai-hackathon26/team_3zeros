import React, { Suspense } from "react";
import { notFound } from "next/navigation";
import { WelcomeScreen } from "../../../../components/auth/WelcomeScreen";
import { FEATURES } from "../../../../features/flags";

/** Q-15. With the flag off the route does not exist. */
export default function WelcomePage() {
  if (!FEATURES.patientProfile) notFound();
  return (
    <Suspense>
      <WelcomeScreen />
    </Suspense>
  );
}
