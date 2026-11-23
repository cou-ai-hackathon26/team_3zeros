import type React from "react";
import type { Locale } from "../i18n/config";

export interface LocalePageProps {
  // Next.js 15 generated PageProps passes params as a Promise<any>,
  // while unit tests pass synchronous { locale } plain objects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any;
}

export interface LocaleLayoutProps extends LocalePageProps {
  children: React.ReactNode;
}

export function resolveSyncLocale(
  params: unknown,
  fallback: Locale = "bn"
): Locale {
  if (!params || typeof params !== "object") {
    return fallback;
  }
  // Never access properties synchronously on a Next.js 15 Promise / Thenable
  if (
    params instanceof Promise ||
    typeof (params as { then?: unknown }).then === "function"
  ) {
    return fallback;
  }
  const candidate = (params as { locale?: unknown }).locale;
  if (candidate === "bn" || candidate === "en") {
    return candidate;
  }
  return fallback;
}
