"use client";

import React, { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";

export interface AnimatedBeamProps {
  className?: string;
}

/**
 * E4: Animated Beam (UI_COMPONENT_LIBRARY_STRATEGY §4)
 * Visual beam travelling between sender and receiver in the closed-loop referral tile.
 * Finite repeat: 2 passes then rests in final state.
 * Static under reduced motion.
 */
export function AnimatedBeam({ className }: AnimatedBeamProps) {
  const prefersReduced = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const isInView = useInView(ref, { once: true });

  if (prefersReduced) {
    return (
      <svg
        ref={ref}
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0 size-full", className)}
      >
        <line
          x1="20%"
          y1="50%"
          x2="80%"
          y2="50%"
          className="stroke-paddy"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
      </svg>
    );
  }

  return (
    <svg
      ref={ref}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    >
      <line
        x1="20%"
        y1="50%"
        x2="80%"
        y2="50%"
        className="stroke-line"
        strokeWidth="2"
      />
      {isInView && (
        <motion.line
          x1="20%"
          y1="50%"
          x2="80%"
          y2="50%"
          className="stroke-paddy"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{
            pathLength: [0, 1, 1, 0],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 3,
            times: [0, 0.45, 0.55, 1],
            repeat: 1, // exactly 2 passes
            ease: "easeInOut",
          }}
        />
      )}
    </svg>
  );
}
