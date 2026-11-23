import React from "react";
import { Check, Diamond, Circle, TriangleAlert, OctagonAlert, FilePen } from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { cn } from "../../lib/cn";

export type StatusTone = "neutral" | "active" | "positive" | "draft" | "attention" | "emergency";

export interface StatusBadgeProps {
  entity: "appointment" | "referral" | "triage_session" | "document" | "consent_request" | "consent" | "emergency_queue" | "fhir_sync";
  state: string;
  tone?: StatusTone;
  locale: Locale;
}

const TONE: Record<StatusTone, { className: string; Icon: typeof Check }> = {
  neutral: { className: "bg-sunken text-ink", Icon: Circle },
  active: { className: "bg-indigo-wash text-ink", Icon: Diamond },
  positive: { className: "bg-positive-wash text-positive", Icon: Check },
  draft: { className: "border border-dashed border-ochre bg-ochre-wash text-ochre", Icon: FilePen },
  attention: { className: "bg-ochre-wash text-ochre", Icon: TriangleAlert },
  emergency: { className: "bg-signal-wash text-signal", Icon: OctagonAlert },
};

/**
 * DESIGN_SYSTEM §6.6. Icon plus word from `state.<entity>.<STATE>`; never colour
 * alone. Replaces StatusLabel (same i18n keys).
 */
export function StatusBadge({ entity, state, tone = "neutral", locale }: StatusBadgeProps) {
  const { className, Icon } = TONE[tone];
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-dense font-medium",
        className,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span>{t(locale, `state.${entity}.${state}`)}</span>
    </span>
  );
}
