"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { usePageLocale } from "../app/usePageLocale";
import { landingFor, resolveNext } from "./access";
import { getLastArea } from "./lastArea";
import type { UserMe } from "./types";

/**
 * After a successful sign-in (AUTH_RBAC §4.4): `next` if it is same-origin and inside an
 * area the user may enter; else the single area's home; else last used area or the
 * chooser. Returns "none" when the user has no area so the caller shows the right message.
 */
export function useSignInRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const locale = usePageLocale(undefined, "bn");

  return useCallback(
    (me: UserMe): "redirected" | "none" => {
      const next = resolveNext(params?.get("next"), me);
      if (next) {
        router.replace(next);
        return "redirected";
      }
      const landing = landingFor(me, getLastArea());
      if (landing.kind === "none") return "none";
      const nextParam = params?.get("next");
      router.replace(
        landing.kind === "home"
          ? `/${locale}${landing.path}`
          : `/${locale}/login/choose${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ""}`,
      );
      return "redirected";
    },
    [router, params, locale],
  );
}
