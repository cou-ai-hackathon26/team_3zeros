"use client";

import React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, alertActionClass, alertCancelClass } from "./ui/overlays";

/**
 * Confirmation for a consequential action. Import it with `next/dynamic` and render it only while
 * open, so the Radix alert dialog stays out of the first load of the page (170 KB patient budget).
 */
export function ConfirmDialog({
  title,
  description,
  cancelLabel,
  confirmLabel,
  destructive = true,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent title={title} description={description}>
        <div className="flex justify-end gap-2">
          <AlertDialogCancel className={alertCancelClass}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction className={alertActionClass(destructive)} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
