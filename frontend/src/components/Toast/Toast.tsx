"use client";

import React from "react";
import styles from "./Toast.module.css";

export interface ToastProps {
  message: string;
  tone?: "neutral" | "error";
  requestId?: string;
  onDismiss?: () => void;
}

/**
 * UIUX §5 & §7:
 * Uses the same active verb as the button ("Request accepted"). No apologies.
 * Errors explain what went wrong and what to do.
 */
export function Toast({ message, tone = "neutral", requestId, onDismiss }: ToastProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`${styles.toast} ${tone === "error" ? styles.error : ""}`}
    >
      <div className={styles.body}>
        <span>{message}</span>
        {requestId && <code className={styles.requestId}>{requestId}</code>}
      </div>
      {onDismiss && (
        <button type="button" className={styles.closeBtn} onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}
