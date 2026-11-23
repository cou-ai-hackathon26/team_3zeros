"use client";

import React, { useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { canEnter, isOpenPath, type Area } from "../../auth/access";
import { useMe } from "../../auth/me";
import { ErrorState, Skeleton } from "../ui/states";
import { NotAuthorised } from "./NotAuthorised";
import { PatientShell } from "./PatientShell";

// The workspace shell (sidebar, sheet, idle timeout) is only loaded for clinical and admin areas,
// so patient routes do not carry it (170 KB budget, FRONTEND §11).
const WorkspaceShell = dynamic(() => import("./WorkspaceShell").then((m) => m.WorkspaceShell), {
  loading: () => (
    <div className="mx-auto max-w-md p-6">
      <Skeleton />
    </div>
  ),
});

/**
 * Layout guard and shell chooser (AUTH_RBAC §5.4). User experience only; the API is
 * the enforcement layer. While `me` loads it shows a skeleton, so no content flashes.
 */
export function RequireArea({ area, children }: { area: Area; children: React.ReactNode }) {
  const locale = usePageLocale(undefined, area === "patient" ? "bn" : "en");
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { me, isLoading, isError, error, refetch } = useMe();

  const subPath = pathname.replace(/^\/(bn|en)(?=\/|$)/, "") || "/";
  const signedOutAllowed = area === "patient" && isOpenPath(subPath);

  useEffect(() => {
    if (me === null && !signedOutAllowed) {
      const next = encodeURIComponent(pathname);
      router.replace(`/${locale}/login${area === "patient" ? "" : "/staff"}?next=${next}`);
    }
  }, [me, signedOutAllowed, area, locale, pathname, router]);

  if (isError) {
    const requestId = (error as { requestId?: string } | null)?.requestId;
    return <ErrorState message={t(locale, "errorPage.title")} locale={locale} onRetry={() => refetch()} requestId={requestId} />;
  }
  if (isLoading || (me === null && !signedOutAllowed)) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Skeleton label={t(locale, "shell.loading")} />
      </div>
    );
  }
  if (me === null) return <PatientShell>{children}</PatientShell>; // signed-out visitor on an open path (Q-03)
  if (!me || !canEnter(me, area)) return me ? <NotAuthorised me={me} /> : null;
  return area === "patient" ? <PatientShell>{children}</PatientShell> : <WorkspaceShell me={me} area={area}>{children}</WorkspaceShell>;
}
