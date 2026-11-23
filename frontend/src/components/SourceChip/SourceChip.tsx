"use client";

import React from "react";
import { ArrowUpRight } from "lucide-react";

export interface SourceReference {
  id: string;
  label: string;
}

export interface SourceChipProps {
  source: SourceReference;
  onOpen: (sourceId: string) => void;
}

/**
 * Links a referral statement to its verified report page or clinical record entry
 * (BACKEND §10.3, DESIGN_SYSTEM §6.5).
 */
export function SourceChip({ source, onOpen }: SourceChipProps) {
  return (
    <button
      type="button"
      className="inline-flex min-h-8 items-center gap-1 rounded-control border border-line bg-surface px-2 text-caption font-medium text-indigo hover:bg-indigo-wash"
      onClick={() => onOpen(source.id)}
    >
      <ArrowUpRight aria-hidden className="size-3.5" />
      <span>{source.label}</span>
    </button>
  );
}
