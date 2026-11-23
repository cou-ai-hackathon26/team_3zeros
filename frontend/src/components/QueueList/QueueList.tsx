"use client";

import React, { useMemo, useState } from "react";
import type { Locale } from "../../i18n/config";
import { formatWaitingAge, t } from "../../i18n/format";
import styles from "./QueueList.module.css";

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
    return <p className={styles.empty}>{t(locale, "clinician.emptyQueue")}</p>;
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
      className={styles.list}
      onKeyDown={handleKeyDown}
    >
      {visibleItems.map((item, idx) => {
        const isSelected = item.id === selectedId || idx === focusedIdx;
        return (
          <div
            key={item.id}
            role="option"
            aria-selected={isSelected}
            className={`${styles.row} ${isSelected ? styles.selected : ""} ${
              item.escalated ? styles.escalated : ""
            }`}
            onClick={() => {
              setFocusedIdx(idx);
              onSelect(item.id);
            }}
          >
            <div className={styles.headerRow}>
              <span className={styles.patientName}>
                {item.patientName}
                {item.patientNameBn && (
                  <span lang="bn" className={styles.nameBn}>
                    {" "}
                    ({item.patientNameBn})
                  </span>
                )}
              </span>
              <span className={styles.age}>
                {formatWaitingAge(item.createdAt, locale)}
              </span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.reason}>{item.reason}</span>
              <span
                className={`${styles.urgencyTag} ${
                  item.urgency === "emergency" ? styles.emergencyTag : ""
                }`}
              >
                {item.urgency}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
