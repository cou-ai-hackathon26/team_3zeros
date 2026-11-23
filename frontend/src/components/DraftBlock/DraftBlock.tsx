"use client";

import React from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { SourceChip, type SourceReference } from "../SourceChip/SourceChip";
import styles from "./DraftBlock.module.css";

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
      className={`${styles.block} ${verified ? styles.verified : styles.draft}`}
    >
      <svg className={styles.borderOverlay} aria-hidden="true">
        <rect
          x="1"
          y="1"
          width="99%"
          height="98%"
          rx="12"
          ry="12"
          className={verified ? styles.solidRect : styles.dashedRect}
        />
      </svg>

      <header className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {!verified && (
          <span className={styles.draftTag}>
            {t(locale, "clinician.draftBadge")}
          </span>
        )}
      </header>

      {children ? (
        <div className={styles.content}>{children}</div>
      ) : editable ? (
        <textarea
          aria-label={title}
          className={styles.editor}
          value={content}
          onChange={(e) => onChange?.(e.target.value)}
        />
      ) : (
        <p className={styles.content}>{content}</p>
      )}

      {sources.length > 0 && (
        <div className={styles.sourceList}>
          {sources.map((src) => (
            <SourceChip key={src.id} source={src} onOpen={onOpenSource} />
          ))}
        </div>
      )}
    </section>
  );
}
