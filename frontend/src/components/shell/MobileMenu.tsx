"use client";

import "../../i18n/landing";
import React, { useState } from "react";
import { ChevronRight, Menu } from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { Button, buttonVariants } from "../ui/button";
import { Dialog, DialogTrigger, SheetContent } from "../ui/overlays";

/** Phone menu for the public header: section links, staff sign-in and patient sign-in (LANDING §4.0). */
export function MobileMenu({ locale, signedIn, sections }: { locale: Locale; signedIn: boolean; sections: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const link =
    "flex min-h-12 items-center justify-between rounded-panel px-3 text-body font-medium text-ink no-underline transition-colors duration-[var(--motion-feedback-duration)] hover:bg-sunken active:bg-indigo-wash";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="quiet" aria-label={t(locale, "shell.menu")} className="px-2.5">
          <Menu aria-hidden className="size-5" />
        </Button>
      </DialogTrigger>
      <SheetContent side="right" title={t(locale, "shell.menu")} closeLabel={t(locale, "common.close")}>
        <nav aria-label={t(locale, "landing.nav.label")} className="flex flex-col gap-1">
          {sections.map((s) => (
            <a key={s.href} href={s.href} className={link} onClick={() => setOpen(false)}>
              <span>{s.label}</span>
              <ChevronRight aria-hidden className="size-4 text-ink-muted" />
            </a>
          ))}
          {!signedIn && (
            <>
              <hr className="my-3 border-0 border-t border-line" />
              <div className="flex flex-col gap-2.5 pt-1">
                <a
                  href={`/${locale}/triage`}
                  onClick={() => setOpen(false)}
                  className={buttonVariants({ size: "lg", className: "w-full" })}
                >
                  {t(locale, "shell.describeProblem")}
                </a>
                <a className={link} href={`/${locale}/login`} onClick={() => setOpen(false)}>
                  <span>{t(locale, "landing.footer.patientSignIn")}</span>
                  <ChevronRight aria-hidden className="size-4 text-ink-muted" />
                </a>
                <a className={link} href={`/${locale}/login/staff`} onClick={() => setOpen(false)}>
                  <span>{t(locale, "shell.staffSignIn")}</span>
                  <ChevronRight aria-hidden className="size-4 text-ink-muted" />
                </a>
              </div>
            </>
          )}
        </nav>
      </SheetContent>
    </Dialog>
  );
}
