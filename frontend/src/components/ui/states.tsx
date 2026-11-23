"use client";

import React, { useEffect, useState } from "react";
import { Info, CircleCheck, TriangleAlert, OctagonAlert } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { Button } from "./button";

/** One sentence saying what will appear here, and one action when there is one. No illustration. */
export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 py-8 text-body text-ink-muted">
      <p className="m-0">{message}</p>
      {action}
    </div>
  );
}

/** What happened, what to do, "Try again", and the request ID for unknown errors. */
export function ErrorState({
  message,
  locale,
  onRetry,
  retryLabel,
  requestId,
  variant = "page",
}: {
  message: string;
  locale: Locale;
  onRetry?: () => void;
  /** Defaults to "Try again". */
  retryLabel?: string;
  requestId?: string;
  variant?: "page" | "inline";
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-start gap-3 text-ink", variant === "page" ? "py-12" : "py-3")}
    >
      <p className={cn("m-0", variant === "page" ? "text-heading font-semibold" : "text-dense")}>{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel ?? t(locale, "common.tryAgain")}
        </Button>
      )}
      {requestId && (
        <p className="m-0 text-caption text-ink-muted">
          {t(locale, "common.requestId")}: <span className="tabular-nums">{requestId}</span>
        </p>
      )}
    </div>
  );
}

/** Static skeleton (no shimmer). After 1 second a text label appears, e.g. "Loading your appointments". */
export function Skeleton({ label, className }: { label?: string; className?: string }) {
  const [showLabel, setShowLabel] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShowLabel(true), 1000);
    return () => clearTimeout(id);
  }, []);
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-2">
      <div aria-hidden className={cn("h-12 w-full rounded-control bg-sunken", className)} />
      {showLabel && label && <p className="m-0 text-caption text-ink-muted">{label}</p>}
    </div>
  );
}

const alert = cva("flex items-start gap-3.5 rounded-[18px] p-4 text-dense", {
  variants: {
    tone: {
      info: "bg-indigo-wash text-ink",
      positive: "bg-positive-wash text-ink",
      attention: "bg-ochre-wash text-ink",
      emergency: "bg-signal-wash text-ink",
    },
  },
  defaultVariants: { tone: "info" },
});
const ICON = { info: Info, positive: CircleCheck, attention: TriangleAlert, emergency: OctagonAlert } as const;
const ICON_COLOUR = { info: "text-indigo", positive: "text-positive", attention: "text-ochre", emergency: "text-signal" } as const;

/** In the page flow, with icon, title, one sentence and at most one action. */
export function Alert({
  tone = "info",
  title,
  children,
  action,
}: VariantProps<typeof alert> & { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const key = tone ?? "info";
  const Icon = ICON[key];
  return (
    <div role={key === "emergency" ? "alert" : "status"} className={alert({ tone })}>
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", ICON_COLOUR[key])} />
      <div className="flex flex-col gap-1">
        <p className="m-0 font-semibold">{title}</p>
        {children && <p className="m-0">{children}</p>}
        {action}
      </div>
    </div>
  );
}
