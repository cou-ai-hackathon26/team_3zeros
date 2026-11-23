"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { TriageDraftSummary } from "../../../../../../voice/types";
import { type LocalePageProps } from "../../../../../resolveLocale";
import { usePageLocale } from "../../../../../usePageLocale";
import { PageHeader, Panel } from "../../../../../../components/ui/surfaces";
import { buttonVariants, Button } from "../../../../../../components/ui/button";

export default function TriageSummaryReviewPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "bn");
  let sessionId = "sess-1";
  try {
    const routeParams = useParams();
    if (routeParams && typeof routeParams.id === "string") {
      sessionId = routeParams.id;
    }
  } catch {
    sessionId = "sess-1";
  }

  const [patientWords, setPatientWords] = useState(
    locale === "bn"
      ? "গত ৩ দিন ধরে জ্বর এবং মাথাব্যথা, বুকে কোনো ব্যথা নেই।"
      : "Fever and headache for the past 3 days, no chest pain."
  );
  const [symptoms, setSymptoms] = useState("জ্বর ও মাথাব্যথা / Fever & headache");
  const [duration, setDuration] = useState("৩ দিন / 3 days");
  const [severity, setSeverity] = useState("মাঝারি / Moderate");
  const [specialty, setSpecialty] = useState("মেডিসিন (Internal Medicine)");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedRaw = window.sessionStorage.getItem("mw_triage_draft");
      if (savedRaw) {
        const draft = JSON.parse(savedRaw) as TriageDraftSummary;
        if (draft.patientWords) setPatientWords(draft.patientWords);
        if (draft.chiefComplaint) setSymptoms(draft.chiefComplaint);
        if (draft.duration) setDuration(draft.duration);
        if (draft.severity) setSeverity(draft.severity);
        if (draft.suggestedSpecialtyBn || draft.suggestedSpecialtyEn) {
          setSpecialty(
            locale === "bn"
              ? draft.suggestedSpecialtyBn
              : draft.suggestedSpecialtyEn
          );
        }
      }
    } catch {
      // Ignore parse error
    }

    if (sessionId && sessionId !== "sess-1" && typeof fetch === "function") {
      fetch(`/api/v1/triage/sessions/${sessionId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.summary) {
            if (data.summary.patient_words) {
              setPatientWords(data.summary.patient_words);
            }
            const sf = data.summary.structured_fields || {};
            if (sf.chief_complaint) setSymptoms(sf.chief_complaint);
            if (sf.duration) setDuration(sf.duration);
            if (sf.severity) setSeverity(sf.severity);
            if (sf.suggested_specialty_bn || sf.suggested_specialty_en) {
              setSpecialty(
                locale === "bn"
                  ? sf.suggested_specialty_bn || sf.suggested_specialty_en
                  : sf.suggested_specialty_en || sf.suggested_specialty_bn
              );
            }
          }
        })
        .catch(() => {});
    }
  }, [locale, sessionId]);

  async function handleConfirmSummary() {
    setSubmitting(true);
    if (
      sessionId &&
      sessionId !== "sess-1" &&
      typeof window !== "undefined" &&
      typeof fetch === "function"
    ) {
      try {
        await fetch(`/api/v1/triage/sessions/${sessionId}/finish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        await fetch(`/api/v1/triage/sessions/${sessionId}/summary/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            edits: {
              chief_complaint: symptoms,
              duration,
              severity,
              suggested_specialty: specialty,
            },
          }),
        });
      } catch {
        // Proceed cleanly
      }
    }
    setSubmitting(false);
    setConfirmed(true);
  }

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        serif
        title={locale === "bn" ? "সারাংশ যাচাই করুন" : "Review your intake summary"}
        context={
          locale === "bn"
            ? "ডাক্তারকে দেখানোর আগে আপনার উপসর্গ এবং সমস্যা যাচাই করে নিন"
            : "Review and edit the summary of your symptoms before requesting a consultation"
        }
      />

      <Panel title={locale === "bn" ? "আপনার নিজের কথায়" : "In your own words"}>
        <blockquote className="m-0 border-l-2 border-indigo pl-4 text-body italic text-ink">
          “{patientWords}”
        </blockquote>
      </Panel>

      <Panel title={locale === "bn" ? "সংক্ষিপ্ত বিবরণ (প্রয়োজনে সংশোধন করুন)" : "Extracted summary (Edit if needed)"}>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-dense font-medium text-ink">
            <span>{locale === "bn" ? "প্রধান উপসর্গ" : "Chief Symptoms"}</span>
            <input
              type="text"
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body"
            />
          </label>
          <label className="flex flex-col gap-1 text-dense font-medium text-ink">
            <span>{locale === "bn" ? "সময়কাল" : "Duration"}</span>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body"
            />
          </label>
          <label className="flex flex-col gap-1 text-dense font-medium text-ink">
            <span>{locale === "bn" ? "তীব্রতা" : "Severity"}</span>
            <input
              type="text"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body"
            />
          </label>
          <label className="flex flex-col gap-1 text-dense font-medium text-ink">
            <span>{locale === "bn" ? "প্রস্তাবিত বিভাগ" : "Suggested Specialty"}</span>
            <input
              type="text"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body"
            />
          </label>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
        {!confirmed ? (
          <Button
            size="lg"
            disabled={submitting}
            onClick={() => void handleConfirmSummary()}
          >
            {locale === "bn"
              ? "সারাংশ নিশ্চিত করুন ও ডাক্তার খুঁজুন"
              : "Confirm summary & find a doctor"}
          </Button>
        ) : (
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p role="status" className="m-0 text-dense font-semibold text-pine">
              {locale === "bn"
                ? "✓ সারাংশ নিশ্চিত হয়েছে। এখন ডাক্তার নির্বাচন করে অ্যাপয়েন্টমেন্টের সাথে যুক্ত করতে পারেন।"
                : "✓ Summary confirmed. Ready to attach to an appointment request."}
            </p>
            <Link
              href={`/${locale}/doctors`}
              className={buttonVariants({ variant: "primary", size: "lg" })}
            >
              {locale === "bn" ? "ডাক্তার ও হাসপাতাল খুঁজুন →" : "Browse doctors & clinics →"}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
