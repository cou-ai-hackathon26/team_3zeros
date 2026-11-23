import React from "react";

/** Two interlocking chevrons: one hand passing to the next (DESIGN_SYSTEM §1.2). */
export function Mark({ className = "size-6", tile = false }: { className?: string; tile?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      {tile && <rect width="24" height="24" rx="6" className="fill-indigo-deep" />}
      <path d="M6 5l7 7-7 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-indigo" fill="none" />
      <path d="M12 5l7 7-7 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={tile ? "stroke-paddy" : "stroke-indigo"} fill="none" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-sans text-subheading font-semibold text-ink ${className ?? ""}`}>
      <Mark />
      <span>Medi Waypoint</span>
    </span>
  );
}
