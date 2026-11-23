"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { useAdapters } from "../../features/adapters";
import { buttonVariants } from "../ui/button";

/** Q-17 · landing state of a verification link only. No resend screen until Q-17 says who triggers verification. */
export function VerifyEmailScreen() {
  const locale = usePageLocale(undefined, "en");
  const { emailVerification } = useAdapters();
  const token = useSearchParams()?.get("token") ?? "";
  const [result, setResult] = useState<"pending" | "success" | "expired" | "used" | "error">("pending");
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    emailVerification.confirm(token).then(setResult, () => setResult("error"));
  }, [token, emailVerification]);

  const message =
    result === "success" ? t(locale, "auth.verifyEmail.success")
    : result === "used" ? t(locale, "auth.verifyEmail.used")
    : result === "pending" && token ? t(locale, "common.loading")
    : result === "error" ? t(locale, "error.generic")
    : t(locale, "auth.verifyEmail.expired");
  return (
    <>
      <p role="status" className="m-0 font-serif text-title">{message}</p>
      <Link href={`/${locale}/login/staff`} className={buttonVariants({ size: "lg" })}>{t(locale, "auth.verifyEmail.signIn")}</Link>
    </>
  );
}
