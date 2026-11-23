"use client";

import React from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { SourceChip, type SourceReference } from "../SourceChip/SourceChip";
import { cn } from "../../lib/cn";

export interface DraftBlockProps {
  title: string;
  content?: string;
  verified?: boolean;
  sources?: SourceReference[];
  locale: Locale;
  editable?: boolean;
  onChange?: (nextContent: string) => void;
  onOpenSource?: (sourceId: string) => void;
  children?: React.ReactNode;
}

/**
 * UIUX §3.2, §4.2, §5 & FRONTEND §10.2 (INV-7):
 * - Unverified AI/OCR output uses --color-draft with a 1.5px dashed SVG border overlay
 *   and the word "Draft" / "যাচাই হয়নি" so the difference survives grayscale printing.
 * - When verified, the SVG border transitions smoothly to a solid --color-line border.
 */
export function DraftBlock({
  title,
  content = "",
  verified = false,
  sources = [],
  locale,
  editable = false,
  onChange,
  onOpenSource = () => {},
  children,
}: DraftBlockProps) {
  return (
    <section
      data-verified={verified ? "true" : "false"}
      className={cn(
        "relative flex flex-col gap-3 rounded-panel p-4",
        verified ? "bg-surface" : "bg-draft-wash",
      )}
    >
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full">
        <rect
          x="1"
          y="1"
          width="99%"
          height="98%"
          rx="10"
          ry="10"
          fill="none"
          className={cn(
            "transition-[stroke-dasharray] duration-[var(--motion-state-duration)] ease-[var(--motion-state-easing)]",
            verified
              ? "stroke-line [stroke-dasharray:0] [stroke-width:1px]"
              : "stroke-draft [stroke-dasharray:6_4] [stroke-width:1.5px]",
          )}
        />
      </svg>

      <header className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-subheading font-semibold text-ink">{title}</h3>
        {!verified && (
          <span className="rounded-control bg-surface px-2 py-0.5 text-caption font-semibold text-draft">
            {t(locale, "clinician.draftBadge")}
          </span>
        )}
      </header>

      {children ? (
        <div className="text-dense text-ink">{children}</div>
      ) : editable ? (
        <textarea
          aria-label={title}
          className="min-h-28 w-full rounded-control border border-line-strong bg-surface p-3 text-dense text-ink"
          value={content}
          onChange={(e) => onChange?.(e.target.value)}
        />
      ) : (
        <p className="m-0 text-dense text-ink">{content}</p>
      )}

      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sources.map((src) => (
            <SourceChip key={src.id} source={src} onOpen={onOpenSource} />
          ))}
        </div>
      )}
    </section>
  );
}
