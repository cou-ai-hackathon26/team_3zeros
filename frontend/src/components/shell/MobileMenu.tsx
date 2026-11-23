"use client";

import "../../i18n/landing";
import React, { useState } from "react";
import { Menu } from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { Button } from "../ui/button";
import { Dialog, DialogTrigger, SheetContent } from "../ui/overlays";

/** Phone menu for the public header: section links, staff sign-in and patient sign-in (LANDING §4.0). */
export function MobileMenu({ locale, signedIn, sections }: { locale: Locale; signedIn: boolean; sections: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const link = "flex min-h-11 items-center text-body text-ink no-underline";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="quiet" aria-label={t(locale, "shell.menu")}>
          <Menu aria-hidden className="size-5" />
        </Button>
      </DialogTrigger>
      <SheetContent side="right" title={t(locale, "shell.menu")} closeLabel={t(locale, "common.close")}>
        <nav aria-label={t(locale, "landing.nav.label")} className="flex flex-col">
          {sections.map((s) => (
            <a key={s.href} href={s.href} className={link} onClick={() => setOpen(false)}>{s.label}</a>
          ))}
          {!signedIn && (
            <>
              <hr className="my-2 border-0 border-t border-line" />
              <a className={link} href={`/${locale}/login`}>{t(locale, "landing.footer.patientSignIn")}</a>
              <a className={link} href={`/${locale}/login/staff`}>{t(locale, "shell.staffSignIn")}</a>
            </>
          )}
        </nav>
      </SheetContent>
    </Dialog>
  );
}
