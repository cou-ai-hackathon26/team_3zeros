"use client";

import React, { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";

export interface BlurFadeProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  yOffset?: number;
  inView?: boolean;
}

/**
 * E1: Blur Fade (UI_COMPONENT_LIBRARY_STRATEGY §4)
 * Content fades in once when entering the viewport.
 * Blur filter removed for low-end GPUs; keeps opacity and 8px offset.
 * Fully supports reduced motion.
 */
export function BlurFade({
  children,
  className,
  delay = 0,
  duration = 0.3,
  yOffset = 8,
  inView = true,
}: BlurFadeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hasObserver = typeof globalThis !== "undefined" && typeof globalThis.IntersectionObserver !== "undefined";
  const inViewResult = useInView(ref, { once: true, margin: "0px 0px -50px 0px" });
  const shouldAnimate = inView && hasObserver ? inViewResult : true;
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: yOffset }}
      animate={shouldAnimate ? { opacity: 1, y: 0 } : { opacity: 0, y: yOffset }}
      transition={{
        duration,
        delay,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
