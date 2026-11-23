"use client";

import "../../i18n/auth";
import React, { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";
import { ApiError } from "../../api/client";
import { t } from "../../i18n/format";
import type { Locale } from "../../i18n/config";

/** Heading that takes focus when a step changes, so keyboard and screen-reader users land on the new step. */
export function StepHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} id={id} tabIndex={-1} className="m-0 font-serif text-title outline-none">
      {children}
    </h1>
  );
}

/** Form-level error above the fields; announced to assistive technology. */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-panel bg-ochre-wash p-3 text-dense text-ink">
      <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-ochre" />
      <p className="m-0">{message}</p>
    </div>
  );
}

/** Message for an unexpected failure, with the request ID when the API gave one. */
export function genericError(locale: Locale, e: unknown): string {
  const id = e instanceof ApiError ? e.requestId : undefined;
  return `${t(locale, "error.generic")}${id ? ` (${t(locale, "common.requestId")}: ${id})` : ""}`;
}
