"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

export interface ToastProps {
  message: string;
  tone?: "neutral" | "error";
  requestId?: string;
  onDismiss?: () => void;
  closeLabel?: string;
}

/**
 * Presentational toast. Uses the same active verb as the button ("Request accepted");
 * no apologies; errors say what went wrong and what to do (UIUX §7).
 */
export function Toast({ message, tone = "neutral", requestId, onDismiss, closeLabel = "Close" }: ToastProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-center justify-between gap-3 rounded-panel border px-4 py-3 text-dense text-ink shadow-float",
        tone === "error" ? "border-ochre bg-ochre-wash" : "border-line bg-surface",
      )}
    >
      <div className="flex flex-col gap-1">
        <span>{message}</span>
        {requestId && <code className="text-caption tabular-nums text-ink-muted">{requestId}</code>}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label={closeLabel}
          className="flex size-11 items-center justify-center rounded-control hover:bg-sunken"
          onClick={onDismiss}
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}

interface ToastItem extends Omit<ToastProps, "onDismiss"> {
  id: number;
}

const ToastContext = createContext<(t: Omit<ToastProps, "onDismiss">) => void>(() => {});

/** `const show = useToast(); show({ message: "Request accepted" })`. One Toaster in the root layout. */
export function useToast() {
  return useContext(ToastContext);
}

/** Confirms a completed action for 5 seconds. Never the only place an error is shown. */
export function Toaster({ children, closeLabel }: { children: React.ReactNode; closeLabel?: string }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((t: Omit<ToastProps, "onDismiss">) => {
    setItems((prev) => [...prev, { ...t, id: Date.now() + Math.random() }]);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      <ToastPrimitive.Provider duration={5000} swipeDirection="right">
        {children}
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            duration={item.tone === "error" ? 10000 : 5000}
            onOpenChange={(open) => !open && setItems((prev) => prev.filter((x) => x.id !== item.id))}
            asChild
          >
            <div>
              <Toast
                message={item.message}
                tone={item.tone}
                requestId={item.requestId}
                closeLabel={closeLabel}
                onDismiss={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
              />
            </div>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 end-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
