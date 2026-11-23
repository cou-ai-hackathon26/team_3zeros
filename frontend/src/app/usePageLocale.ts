"use client";

import { useParams, usePathname } from "next/navigation";
import type { Locale } from "../i18n/config";
import { resolveSyncLocale } from "./resolveLocale";

/**
 * FRONTEND §3: locale is the first path segment (/bn/..., /en/...).
 * Next.js 15 passes `params` to pages as an async Promise, so client pages
 * read the active locale from `useParams()` / `usePathname()` without touching
 * the `params` Promise synchronously. Plain-object `params` in Vitest tests
 * still resolve via `resolveSyncLocale`.
 */
export function usePageLocale(params: unknown, fallback: Locale): Locale {
  try {
    const routeParams = useParams<{ locale?: string }>();
    const raw = routeParams?.locale;
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    if (candidate === "bn" || candidate === "en") {
      return candidate;
    }
  } catch {
    // Ignore when rendered outside Next.js App Router in unit tests
  }

  try {
    const pathname = usePathname();
    if (pathname) {
      const firstSeg = pathname.split("/").filter(Boolean)[0];
      if (firstSeg === "bn" || firstSeg === "en") {
        return firstSeg;
      }
    }
  } catch {
    // Ignore when rendered outside Next.js App Router in unit tests
  }

  return resolveSyncLocale(params, fallback);
}
