"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { areasOf, homePath, resolveNext } from "../../auth/access";
import { setLastArea } from "../../auth/lastArea";
import { useMe } from "../../auth/me";
import { buttonVariants } from "../ui/button";
import { Skeleton } from "../ui/states";
import { StepHeading } from "./FormParts";

/** "Continue as" for users who can enter more than one area (AUTH_RBAC §3.1). */
export function ChooseArea() {
  const locale = usePageLocale(undefined, "bn");
  const router = useRouter();
  const params = useSearchParams();
  const { me, isLoading } = useMe();

  useEffect(() => {
    if (me === null) router.replace(`/${locale}/login`);
  }, [me, router, locale]);

  if (isLoading || !me) return <Skeleton label={t(locale, "shell.loading")} />;
  const areas = areasOf(me);
  const next = resolveNext(params?.get("next"), me);

  return (
    <>
      <div className="flex flex-col gap-2">
        <StepHeading>{t(locale, "auth.choose.title")}</StepHeading>
        <p className="m-0 text-dense text-ink-muted">{t(locale, "auth.choose.help")}</p>
      </div>
      <div className="flex flex-col gap-3">
        {areas.map((a) => (
          <Link
            key={a}
            href={next && areas.includes(a) && next.includes(homePath(a)) ? next : `/${locale}${homePath(a)}`}
            onClick={() => setLastArea(a)}
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            {t(locale, `area.${a}`)}
          </Link>
        ))}
      </div>
    </>
  );
}
