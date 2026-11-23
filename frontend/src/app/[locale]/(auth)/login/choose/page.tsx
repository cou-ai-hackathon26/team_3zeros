import React, { Suspense } from "react";
import { ChooseArea } from "../../../../../components/auth/ChooseArea";

export default function ChoosePage() {
  return (
    <Suspense>
      <ChooseArea />
    </Suspense>
  );
}
