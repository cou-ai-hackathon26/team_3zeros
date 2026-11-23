"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import type { VoiceSessionState } from "../../voice/types";
import { cn } from "../../lib/cn";

export interface CallBlobProps {
  phase: VoiceSessionState;
  /** Real audio level 0..1: the agent's voice while speaking, the patient's while listening. */
  level: number;
}

/**
 * Siri-style call blob (MASTERPLAN D-22, UI strategy §4 voice level indicator).
 * It reacts only to real audio level, with a slow pulse while ringing. Colours are theme tokens.
 * Under prefers-reduced-motion it becomes a still ring with a level bar.
 */
export function CallBlob({ phase, level }: CallBlobProps) {
  const reduce = useReducedMotion();
  const speaking = phase === "speaking";
  const ringing = phase === "ringing" || phase === "connected";
  const dim = phase === "connection_lost" || phase === "reconnecting";
  const energy = speaking ? 0.35 + level * 0.9 : phase === "listening" ? 0.15 + level * 0.5 : 0;

  if (reduce) {
    return (
      <div aria-hidden className="flex flex-col items-center gap-4">
        <div className={cn("size-40 rounded-pill border-4", speaking ? "border-indigo bg-indigo-wash" : "border-line-strong bg-sunken")} />
        <div className="h-2 w-40 overflow-hidden rounded-pill bg-sunken">
          <div className="h-full bg-indigo" style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden data-phase={phase} className={cn("relative grid size-64 place-items-center", dim && "opacity-50")}>
      <motion.div
        className="absolute size-full rounded-pill bg-indigo/40 blur-3xl"
        animate={{ scale: ringing ? [1, 1.12, 1] : 1 + energy * 0.7, opacity: speaking ? 0.9 : ringing ? 0.5 : 0.35 + energy }}
        transition={ringing ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { type: "spring", stiffness: 120, damping: 14 }}
      />
      <motion.div
        className="absolute size-48 bg-gradient-to-br from-indigo to-paddy blur-md"
        style={{ borderRadius: "46% 54% 52% 48% / 52% 46% 54% 48%" }}
        animate={{
          scale: ringing ? [1, 1.06, 1] : 1 + energy * 0.35,
          rotate: speaking ? [0, 14, -10, 0] : 0,
        }}
        transition={
          ringing
            ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
            : speaking
              ? { rotate: { duration: 5, repeat: Infinity, ease: "easeInOut" }, scale: { type: "spring", stiffness: 140, damping: 12 } }
              : { type: "spring", stiffness: 100, damping: 14 }
        }
      />
      <motion.div
        className="absolute size-36 rounded-pill bg-surface/60 blur-sm"
        animate={{ scale: 1 + energy * 0.2 }}
        transition={{ type: "spring", stiffness: 160, damping: 16 }}
      />
    </div>
  );
}
