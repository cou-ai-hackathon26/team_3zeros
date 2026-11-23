"use client";

import React from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import type { Locale } from "../i18n/config";
import { ErrorState, Skeleton } from "./ui/states";

/**
 * Loading, error and not-found states for one query (APPLICATION_DESIGN §2). A 404 uses the
 * same wording whether the object is missing or hidden from this user. Empty states belong
 * to the caller, because what "empty" means depends on the data.
 */
export function QueryBoundary<T>({
  query,
  locale,
  loadingLabel,
  errorMessage,
  notFoundMessage,
  children,
}: {
  query: UseQueryResult<T>;
  locale: Locale;
  loadingLabel: string;
  errorMessage: string;
  notFoundMessage?: string;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isLoading) return <Skeleton label={loadingLabel} />;
  if (query.isError) {
    const e = query.error;
    const api = e instanceof ApiError ? e : null;
    const message = api?.status === 404 && notFoundMessage ? notFoundMessage : errorMessage;
    return <ErrorState message={message} locale={locale} onRetry={api?.status === 404 ? undefined : () => query.refetch()} requestId={api?.status === 404 ? undefined : api?.requestId} />;
  }
  return <>{children(query.data as T)}</>;
}

/** Page column: patient pages are single column, 640px wide (home uses the full bento width). */
export function Column({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto flex w-full max-w-[640px] flex-col gap-6 ${className}`}>{children}</div>;
}
