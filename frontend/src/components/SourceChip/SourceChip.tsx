"use client";

import React from "react";
import styles from "./SourceChip.module.css";

export interface SourceReference {
  id: string;
  label: string;
}

export interface SourceChipProps {
  source: SourceReference;
  onOpen: (sourceId: string) => void;
}

/**
 * UIUX §5 & BACKEND §10.3:
 * Links a referral statement to its verified report page or clinical record entry.
 */
export function SourceChip({ source, onOpen }: SourceChipProps) {
  return (
    <button
      type="button"
      className={styles.chip}
      onClick={() => onOpen(source.id)}
    >
      <span className={styles.marker} aria-hidden="true">
        ↗
      </span>
      <span>{source.label}</span>
    </button>
  );
}
