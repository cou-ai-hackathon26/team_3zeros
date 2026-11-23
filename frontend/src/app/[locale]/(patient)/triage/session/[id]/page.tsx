"use client";

import React from "react";
import { useParams } from "next/navigation";
import { type LocalePageProps } from "../../../../../resolveLocale";
import { TriageView } from "../../../../../../features/patient/TriageView";

/** `/triage/session/[id]`: resumes an open triage session loaded from `GET /triage/sessions/{id}`. */
export default function TriageSessionResumePage({ params }: LocalePageProps) {
  const routeParams = useParams<{ id?: string }>();
  const id = typeof routeParams?.id === "string" ? routeParams.id : undefined;
  return <TriageView params={params} resumeSessionId={id} />;
}
