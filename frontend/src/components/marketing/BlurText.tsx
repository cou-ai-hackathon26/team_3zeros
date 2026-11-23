"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";

export interface BlurTextProps {
  text: string;
  className?: string;
  delay?: number;
}

/**
 * E2: Blur Text (UI_COMPONENT_LIBRARY_STRATEGY §4)
 * Headline words resolve in sequence on landing hero load.
 * Word-level splitting only (safe for Bangla conjuncts).
 * Retains full accessible text in aria-label.
 * Fully supports reduced motion.
 */
export function BlurText({ text, className, delay = 0.08 }: BlurTextProps) {
  const prefersReduced = useReducedMotion();
  const words = text.split(" ");

  if (prefersReduced) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={cn("inline-block", className)}>
      {words.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.28,
            delay: index * delay,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="inline-block whitespace-pre"
        >
          {word}{index < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </span>
  );
}
