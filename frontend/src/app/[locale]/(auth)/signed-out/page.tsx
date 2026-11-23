import React, { Suspense } from "react";
import { SignedOut } from "../../../../components/auth/SignedOut";

export default function SignedOutPage() {
  return (
    <Suspense>
      <SignedOut />
    </Suspense>
  );
}
