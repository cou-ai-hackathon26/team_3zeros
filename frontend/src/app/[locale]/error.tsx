"use client";

import React from "react";
import { usePageLocale } from "../usePageLocale";
import { t } from "../../i18n/format";
import { ErrorState } from "../../components/ui/states";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = usePageLocale(undefined, "bn");
  return (
    <main id="main" className="mx-auto max-w-md p-6">
      <ErrorState message={t(locale, "errorPage.title")} locale={locale} onRetry={reset} requestId={error.digest} />
    </main>
  );
}
