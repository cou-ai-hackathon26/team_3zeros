"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Stethoscope } from "lucide-react";
import type { VoiceSessionState } from "../../voice/types";
import { cn } from "../../lib/cn";

export interface CallBlobProps {
  phase: VoiceSessionState;
  /** Real audio level 0..1: the agent's voice while speaking, the patient's while listening. */
  level: number;
}

const BAR_WEIGHTS = [0.45, 0.85, 1, 0.8, 0.5] as const;

/**
 * Doctor-style consultation voice presence orb (MASTERPLAN D-22).
 * Reacts strictly to real audio level, with a calm pulse while ringing and a live 5-bar voice meter.
 * Under prefers-reduced-motion it becomes a still emblem ring with a clean level bar.
 */
export function CallBlob({ phase, level }: CallBlobProps) {
  const reduce = useReducedMotion();
  const speaking = phase === "speaking";
  const listening = phase === "listening";
  const thinking = phase === "thinking";
  const ringing = phase === "ringing" || phase === "connected";
  const dim = phase === "connection_lost" || phase === "reconnecting";
  const clamped = Math.min(1, Math.max(0, level));
  const energy = speaking ? 0.35 + clamped * 0.85 : listening ? 0.18 + clamped * 0.55 : 0;

  if (reduce) {
    return (
      <div aria-hidden className="flex flex-col items-center gap-4">
        <div
          className={cn(
            "grid size-36 place-items-center rounded-pill border-4",
            speaking
              ? "border-indigo bg-indigo-wash text-indigo"
              : listening
                ? "border-positive bg-positive-wash text-positive"
                : "border-line-strong bg-surface text-ink-muted",
          )}
        >
          <Stethoscope className="size-11" strokeWidth={1.75} />
        </div>
        <div className="h-2 w-36 overflow-hidden rounded-pill bg-surface">
          <div className="h-full bg-indigo" style={{ width: `${Math.round(clamped * 100)}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden data-phase={phase} className={cn("flex flex-col items-center gap-5", dim && "opacity-50")}>
      <div className="relative grid size-44 place-items-center sm:size-52 lg:size-56">
        {/* Outer soft audio-reactive halo */}
        <motion.div
          className={cn(
            "absolute inset-0 rounded-pill blur-2xl",
            speaking ? "bg-indigo/30" : listening ? "bg-positive/25" : "bg-indigo/20",
          )}
          animate={{
            scale: ringing ? [1, 1.12, 1] : thinking ? [0.96, 1.05, 0.96] : 1 + energy * 0.45,
            opacity: speaking ? 0.85 : ringing ? 0.55 : 0.35 + energy * 0.5,
          }}
          transition={
            ringing || thinking
              ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
              : { type: "spring", stiffness: 120, damping: 14 }
          }
        />

        {/* Concentric organic breathing ring */}
        <motion.div
          className={cn(
            "absolute size-36 border-2 sm:size-40 lg:size-44",
            speaking
              ? "border-indigo/40 bg-gradient-to-br from-indigo/25 to-paddy/35"
              : listening
                ? "border-positive/35 bg-positive-wash/80"
                : "border-line bg-indigo-wash/75",
          )}
          style={{ borderRadius: "48% 52% 50% 50% / 50% 48% 52% 50%" }}
          animate={{
            scale: ringing ? [1, 1.07, 1] : thinking ? [1, 1.04, 1] : 1 + energy * 0.28,
            rotate: speaking ? [0, 12, -10, 0] : 0,
          }}
          transition={
            ringing || thinking
              ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
              : speaking
                ? {
                    rotate: { duration: 5, repeat: Infinity, ease: "easeInOut" },
                    scale: { type: "spring", stiffness: 140, damping: 12 },
                  }
                : { type: "spring", stiffness: 110, damping: 14 }
          }
        />

        {/* Crisp center Care Guide consultation emblem */}
        <motion.div
          className={cn(
            "relative z-10 grid size-24 place-items-center rounded-pill border bg-surface shadow-float sm:size-28",
            speaking
              ? "border-indigo/35 text-indigo"
              : listening
                ? "border-positive/35 text-positive"
                : "border-line text-ink",
          )}
          animate={{ scale: 1 + energy * 0.08 }}
          transition={{ type: "spring", stiffness: 180, damping: 16 }}
        >
          <Stethoscope className="size-10 sm:size-11" strokeWidth={1.75} />
        </motion.div>
      </div>

      {/* Live 5-bar waveform meter */}
      <div className="flex h-6 items-center gap-1.5">
        {BAR_WEIGHTS.map((weight, idx) => {
          const heightPx = Math.max(
            6,
            Math.round((speaking || listening ? 8 + clamped * 16 * weight : thinking ? 10 : 6)),
          );
          return (
            <motion.span
              key={idx}
              className={cn(
                "w-1.5 rounded-pill",
                speaking ? "bg-indigo" : listening ? "bg-positive" : "bg-line-strong/70",
              )}
              animate={
                thinking
                  ? { height: [6, 16, 6] }
                  : { height: heightPx }
              }
              transition={
                thinking
                  ? { duration: 0.9, repeat: Infinity, delay: idx * 0.12, ease: "easeInOut" }
                  : { type: "spring", stiffness: 220, damping: 18 }
              }
            />
          );
        })}
      </div>
    </div>
  );
}
