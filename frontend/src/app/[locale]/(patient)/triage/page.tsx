"use client";

import React from "react";
import { type LocalePageProps } from "../../../resolveLocale";
import { TriageView } from "../../../../features/patient/TriageView";

export default function TriagePage({ params }: LocalePageProps) {
  return <TriageView params={params} />;
}
