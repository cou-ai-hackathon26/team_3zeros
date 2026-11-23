"use client";

import React, { useRef } from "react";
import { motion, useScroll, useSpring, useTransform, useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";

/**
 * E3: Tracing Beam (UI_COMPONENT_LIBRARY_STRATEGY §4)
 * Scroll-linked line that fills as user scrolls down "How it works".
 * Redrawn as the handover tracker rail.
 * Disabled on mobile (<md) and rendered full under reduced motion.
 */
export function TracingBeam({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 75%", "end 50%"],
  });

  const springProgress = useSpring(scrollYProgress, {
    stiffness: 500,
    damping: 90,
  });

  const heightTransform = useTransform(springProgress, [0, 1], ["0%", "100%"]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div className="hidden md:absolute md:-left-6 md:top-2 md:bottom-2 md:flex md:w-4 md:flex-col md:items-center">
        <div className="absolute h-full w-[2px] bg-line" />
        {prefersReduced ? (
          <div className="absolute h-full w-[2px] bg-indigo" />
        ) : (
          <motion.div
            style={{ height: heightTransform }}
            className="absolute top-0 w-[2px] bg-indigo"
          />
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

