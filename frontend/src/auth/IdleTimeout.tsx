"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "../i18n/config";
import { t } from "../i18n/format";
import { Button } from "../components/ui/button";
import { AlertDialog, AlertDialogContent } from "../components/ui/overlays";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

export interface IdleTimeoutProps {
  locale: Locale;
  /** Idle time before the warning. SECURITY §3.3: 15 minutes idle, warning at 13. */
  warnAfterSeconds?: number;
  /** Visible countdown before sign-out. */
  graceSeconds?: number;
  /** "Stay signed in": should make a cheap authenticated request such as GET /auth/me. */
  onStay: () => Promise<unknown> | void;
  onTimeout: () => void;
}

/**
 * Idle warning for clinical and admin areas. The server must enforce the timeout (audit A-13);
 * until it does, this dialog is advisory. Any activity before the warning restarts the idle period.
 */
export function IdleTimeout({ locale, warnAfterSeconds = 780, graceSeconds = 120, onStay, onTimeout }: IdleTimeoutProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warning = remaining !== null;

  const restartIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setRemaining(graceSeconds), warnAfterSeconds * 1000);
  }, [graceSeconds, warnAfterSeconds]);

  // While no warning is showing, activity restarts the idle period.
  useEffect(() => {
    if (warning) return;
    restartIdle();
    const onActivity = () => restartIdle();
    ACTIVITY_EVENTS.forEach((e) => document.addEventListener(e, onActivity, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach((e) => document.removeEventListener(e, onActivity));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [warning, restartIdle]);

  // Countdown once the warning shows.
  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      onTimeout();
      return;
    }
    const id = setTimeout(() => setRemaining((r) => (r === null ? r : r - 1)), 1000);
    return () => clearTimeout(id);
  }, [remaining, onTimeout]);

  async function stay() {
    await onStay();
    setRemaining(null);
  }

  return (
    <AlertDialog open={warning}>
      {warning && (
        <AlertDialogContent title={t(locale, "idle.title")} description={t(locale, "idle.body").replace("{s}", String(remaining))}>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onTimeout}>{t(locale, "clinician.signOut")}</Button>
            <Button onClick={stay}>{t(locale, "clinician.staySignedIn")}</Button>
          </div>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
