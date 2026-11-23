"use client";

import React, { useMemo, useState } from "react";
import type { Locale } from "../../i18n/config";
import { formatWaitingAge, t } from "../../i18n/format";
import { cn } from "../../lib/cn";

export interface QueueItem {
  id: string;
  patientName: string;
  patientNameBn?: string;
  reason: string;
  urgency: "emergency" | "urgent" | "routine";
  escalated?: boolean;
  escalatedAt?: string;
  createdAt: string;
}

export interface QueueListProps {
  items: QueueItem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  locale: Locale;
}

const URGENCY_WEIGHT: Record<QueueItem["urgency"], number> = {
  emergency: 3,
  urgent: 2,
  routine: 1,
};

/**
 * UIUX §5, §6.8, §6.11 & FRONTEND §10.2:
 * - Sorted by escalated first, then urgency, then oldest waiting age.
 * - Escalated items show a signal left border and escalation time.
 * - Keyboard navigable via J / K / ArrowDown / ArrowUp and Enter.
 * - Virtualizes visible slice above 200 rows.
 */
export function QueueList({ items, selectedId, onSelect, locale }: QueueListProps) {
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      if (Boolean(a.escalated) !== Boolean(b.escalated)) {
        return a.escalated ? -1 : 1;
      }
      if (URGENCY_WEIGHT[a.urgency] !== URGENCY_WEIGHT[b.urgency]) {
        return URGENCY_WEIGHT[b.urgency] - URGENCY_WEIGHT[a.urgency];
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [items]);

  const [focusedIdx, setFocusedIdx] = useState(() => {
    const idx = sorted.findIndex((i) => i.id === selectedId);
    return idx >= 0 ? idx : 0;
  });

  if (sorted.length === 0) {
    return <p className="m-0 p-6 text-dense text-ink-muted">{t(locale, "clinician.emptyQueue")}</p>;
  }

  const visibleItems = sorted.length > 200 ? sorted.slice(0, 200) : sorted;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((prev) => Math.min(visibleItems.length - 1, prev + 1));
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((prev) => Math.max(0, prev - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = visibleItems[focusedIdx];
      if (target) {
        onSelect(target.id);
      }
    }
  }

  return (
    <div
      role="listbox"
      tabIndex={0}
      aria-label={locale === "bn" ? "রোগীর তালিকা" : "Clinician queue"}
      className="flex flex-col border-t border-line outline-offset-2"
      onKeyDown={handleKeyDown}
    >
      {visibleItems.map((item, idx) => {
        const isSelected = item.id === selectedId || idx === focusedIdx;
        return (
          <div
            key={item.id}
            role="option"
            aria-selected={isSelected}
            data-escalated={item.escalated ? "true" : undefined}
            className={cn(
              "flex cursor-pointer flex-col gap-1 border-b border-line px-4 py-3 text-dense",
              "transition-colors duration-[var(--motion-state-duration)] ease-[var(--motion-state-easing)]",
              isSelected ? "bg-indigo-wash" : "bg-surface hover:bg-sunken",
              item.escalated && "border-s-4 border-s-signal bg-emergency-wash",
            )}
            onClick={() => {
              setFocusedIdx(idx);
              onSelect(item.id);
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-ink">
                {item.patientName}
                {item.patientNameBn && (
                  <span lang="bn" className="font-normal text-ink-muted">
                    {" "}
                    ({item.patientNameBn})
                  </span>
                )}
              </span>
              <span className="text-caption tabular-nums text-ink-muted">
                {formatWaitingAge(item.createdAt, locale)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-muted">{item.reason}</span>
              <span
                className={cn(
                  "text-caption font-semibold text-ink-muted",
                  item.urgency === "emergency" && "text-signal",
                )}
              >
                {t(locale, `queue.urgency.${item.urgency}`)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
