"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { landingFor } from "../../auth/access";
import { useAuth } from "../../auth/me";
import type { UserMe } from "../../auth/types";
import { buttonVariants, Button } from "../ui/button";

/** Signed in, wrong area. Says nothing about what the area contains (AUTH_RBAC §5.5). */
export function NotAuthorisedBody({ me, noAccess = false }: { me: UserMe; noAccess?: boolean }) {
  const locale = usePageLocale(undefined, "bn");
  const router = useRouter();
  const { signOut } = useAuth();
  const landing = landingFor(me);
  const home = landing.kind === "home" ? landing.path : landing.kind === "choose" ? "/login/choose" : "/";

  return (
    <>
      <h1 className="m-0 font-serif text-title">{t(locale, "notAuthorised.title")}</h1>
      <p className="m-0 text-body text-ink-muted">{noAccess ? t(locale, "auth.staff.noAccess") : t(locale, "notAuthorised.body")}</p>
      <div className="flex flex-wrap gap-3">
        <Link href={`/${locale}${home}`} className={buttonVariants({ variant: "primary", size: "lg" })}>
          {t(locale, "notAuthorised.home")}
        </Link>
        <Button
          variant="secondary"
          size="lg"
          onClick={async () => {
            await signOut();
            router.replace(`/${locale}/signed-out`);
          }}
        >
          {t(locale, "shell.signOut")}
        </Button>
      </div>
    </>
  );
}

/** Standalone page form, used by RequireArea in place of an area the user cannot enter. */
export function NotAuthorised({ me }: { me: UserMe }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <NotAuthorisedBody me={me} />
    </main>
  );
}
