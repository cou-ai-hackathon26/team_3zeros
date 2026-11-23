"use client";

import React from "react";
import Link from "next/link";
import { usePageLocale } from "../usePageLocale";
import { t } from "../../i18n/format";
import { buttonVariants } from "../../components/ui/button";

/** Same wording whether the object is missing or not visible to this user, matching the API (AUTH_RBAC §5.5). */
export default function NotFound() {
  const locale = usePageLocale(undefined, "bn");
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="m-0 font-serif text-title">{t(locale, "notFound.title")}</h1>
      <Link href={`/${locale}`} className={buttonVariants({ variant: "primary", size: "lg" })}>
        {t(locale, "notFound.home")}
      </Link>
    </main>
  );
}
