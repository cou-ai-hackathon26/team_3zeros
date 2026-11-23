"use client";

import React from "react";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { LinkButton } from "../ui/button";

type Page = "patient" | "staff" | "register";

const TARGETS: Record<Page, { href: string; labelKey: string }> = {
  patient: { href: "/login", labelKey: "auth.staff.patientLink" },
  staff: { href: "/login/staff", labelKey: "auth.patient.staffLink" },
  register: { href: "/register", labelKey: "auth.patient.createLink" },
};

/**
 * Buttons to the other ways in, on every public sign-in page: patient sign in, staff sign in and
 * "create an account". The admin entrance is deliberately not offered here (MASTERPLAN D-17).
 */
export function AuthSwitch({ current }: { current: Page }) {
  const locale = usePageLocale(undefined, "bn");
  const others = (Object.keys(TARGETS) as Page[]).filter((p) => p !== current);
  return (
    <nav aria-label={t(locale, "auth.switch.title")} className="flex flex-col gap-3 border-t border-line pt-6">
      <p className="m-0 text-dense text-ink-muted">{t(locale, "auth.switch.title")}</p>
      {others.map((p) => (
        <LinkButton key={p} href={`/${locale}${TARGETS[p].href}`} variant="secondary" size="lg" className="w-full">
          {t(locale, TARGETS[p].labelKey)}
        </LinkButton>
      ))}
    </nav>
  );
}
