"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Bell, CalendarDays, CircleUser, FileText, Home, Stethoscope } from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { HandoverTracker } from "../HandoverTracker/HandoverTracker";
import { Mark } from "../shell/Mark";
import { ConsentPreview } from "./Client";

export interface PhoneMockupProps {
  locale: Locale;
  doctor: string;
  facility: string;
  purpose: string;
  categories: string[];
  sampleCaption: string;
}

/**
 * Realistic smartphone mockup showcasing the actual Medi Waypoint mobile patient UI
 * (top bar, real HandoverTracker, real ConsentSheet, and 4-tab bottom navigation).
 * All interactive elements inside the screen stay inert and hidden from assistive tech.
 */
export function PhoneMockup({
  locale,
  doctor,
  facility,
  purpose,
  categories,
  sampleCaption,
}: PhoneMockupProps) {
  const prefersReduced = useReducedMotion();

  const tabs = [
    { id: "home", label: t(locale, "nav.home"), Icon: Home, active: false },
    { id: "doctors", label: t(locale, "nav.doctors"), Icon: Stethoscope, active: false },
    { id: "appointments", label: t(locale, "nav.appointments"), Icon: CalendarDays, active: true },
    { id: "reports", label: t(locale, "nav.reports"), Icon: FileText, active: false },
  ] as const;

  return (
    <div className="relative mx-auto flex w-full max-w-[320px] flex-col items-center sm:max-w-[344px]">
      {/* Smartphone Chassis with gentle floating animation */}
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 14 }}
        animate={
          prefersReduced
            ? { opacity: 1 }
            : { opacity: 1, y: [0, -6, 0] }
        }
        transition={
          prefersReduced
            ? { duration: 0 }
            : {
                opacity: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                y: { duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.5 },
              }
        }
        className="relative w-full"
      >
        {/* Subtle hardware buttons along outer bezel */}
        <span aria-hidden="true" className="hidden sm:block absolute -start-[3px] top-24 h-8 w-[3px] rounded-s-control bg-indigo-deep/85" />
        <span aria-hidden="true" className="hidden sm:block absolute -start-[3px] top-36 h-12 w-[3px] rounded-s-control bg-indigo-deep/85" />
        <span aria-hidden="true" className="hidden sm:block absolute -end-[3px] top-32 h-14 w-[3px] rounded-e-control bg-indigo-deep/85" />

        {/* Outer device frame */}
        <div className="rounded-[2.65rem] bg-indigo-deep p-[10px] shadow-float ring-1 ring-ink/20">
          {/* Interactive screen is completely inert and hidden from assistive tech */}
          <div
            inert
            aria-hidden="true"
            className="flex flex-col overflow-hidden rounded-[2.05rem] bg-paper text-ink ring-1 ring-surface/15"
          >
            {/* Mobile status bar + speaker island */}
            <div className="relative flex items-center justify-between bg-paper px-5 pb-1.5 pt-2.5 text-[11px] font-semibold text-ink">
              <span>9:41</span>
              <span className="h-[18px] w-[76px] rounded-pill bg-indigo-deep" />
              <span className="flex items-center gap-1.5">
                <svg viewBox="0 0 16 12" className="h-2.5 w-3.5 fill-ink" aria-hidden="true">
                  <rect x="0" y="7" width="2.5" height="5" rx="0.8" />
                  <rect x="4" y="5" width="2.5" height="7" rx="0.8" />
                  <rect x="8" y="2.5" width="2.5" height="9.5" rx="0.8" />
                  <rect x="12" y="0" width="2.5" height="12" rx="0.8" />
                </svg>
                <span className="inline-flex h-2.5 w-5 items-center rounded-[3px] border border-ink/70 p-[1.5px]">
                  <span className="h-full w-3.5 rounded-[1px] bg-ink" />
                </span>
              </span>
            </div>

            {/* Real Medi Waypoint Mobile App Bar (mirrors PatientShell) */}
            <div className="flex items-center justify-between border-b border-line bg-paper px-3.5 py-2">
              <span className="inline-flex items-center gap-1.5 font-sans text-dense font-semibold text-ink">
                <Mark className="size-4" />
                <span>Medi Waypoint</span>
              </span>
              <span className="flex items-center gap-2 text-ink-muted">
                <span className="relative inline-flex size-7 items-center justify-center rounded-control bg-sunken/70">
                  <Bell className="size-3.5 text-ink" />
                  <span className="absolute end-1.5 top-1.5 size-1.5 rounded-pill bg-indigo" />
                </span>
                <CircleUser className="size-5 text-ink-muted" />
              </span>
            </div>

            {/* Real Mobile App Viewport Content */}
            <div className="flex flex-col gap-2.5 bg-paper px-3 py-3">
              {/* Real HandoverTracker in mobile card proportion */}
              <div className="rounded-panel border border-line bg-surface p-3 shadow-raised [&_p.font-serif]:mb-2 [&_p.font-serif]:text-subheading [&_p.font-serif]:leading-snug [&_ol>li]:px-2.5 [&_ol>li]:py-1.5">
                <HandoverTracker
                  entity="appointment"
                  currentState="REQUESTED"
                  objectId="landing-preview"
                  locale={locale}
                  holderName={doctor}
                />
              </div>

              {/* Real ConsentSheet in compact mobile proportion */}
              <div className="[&_section]:gap-2.5 [&_section]:rounded-panel [&_section]:p-3 [&_section]:shadow-raised [&_h2]:font-sans [&_h2]:text-dense [&_h2]:font-semibold [&_dl]:gap-x-3 [&_dl]:gap-y-1 [&_dl]:text-caption [&_p]:text-caption [&_p]:leading-snug [&_div.grid]:grid-cols-2 [&_div.grid]:gap-2 [&_button]:h-9 [&_button]:px-2 [&_button]:text-caption">
                <ConsentPreview
                  locale={locale}
                  doctor={doctor}
                  facility={facility}
                  purpose={purpose}
                  categories={categories}
                />
              </div>
            </div>

            {/* Real Mobile Bottom Tab Bar (mirrors PatientShell) */}
            <div className="border-t border-line bg-surface px-1 pt-1.5 pb-2">
              <div className="grid grid-cols-4 gap-0.5">
                {tabs.map(({ id, label, Icon, active }) => (
                  <span
                    key={id}
                    className={
                      active
                        ? "flex flex-col items-center justify-center gap-0.5 rounded-control bg-indigo-wash px-1 py-1.5 text-[10px] font-semibold text-indigo"
                        : "flex flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1.5 text-[10px] font-medium text-ink-muted"
                    }
                  >
                    <Icon className="size-3.5" />
                    <span className="max-w-full truncate">{label}</span>
                  </span>
                ))}
              </div>
              <div className="mx-auto mt-2 h-1 w-24 rounded-pill bg-ink/20" />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Honest sample-data caption outside [inert] */}
      <p className="m-0 mt-4 text-center text-caption text-ink-muted">{sampleCaption}</p>
    </div>
  );
}
