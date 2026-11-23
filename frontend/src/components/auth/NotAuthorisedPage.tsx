"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePageLocale } from "../../app/usePageLocale";
import { useMe } from "../../auth/me";
import { NotAuthorisedBody } from "../shell/NotAuthorised";
import { Skeleton } from "../ui/states";
import { t } from "../../i18n/format";

/** `/not-authorised`. A signed-in user with no role sees "no facility access yet". */
export function NotAuthorisedPage() {
  const locale = usePageLocale(undefined, "bn");
  const router = useRouter();
  const { me, isLoading } = useMe();
  useEffect(() => {
    if (me === null) router.replace(`/${locale}/login`);
  }, [me, router, locale]);
  if (isLoading || !me) return <Skeleton label={t(locale, "shell.loading")} />;
  return <NotAuthorisedBody me={me} noAccess={me.roles.length === 0} />;
}
