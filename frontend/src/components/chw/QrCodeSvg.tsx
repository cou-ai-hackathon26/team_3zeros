"use client";

import React from "react";

/**
 * Zero-PII opaque token QR SVG renderer for Medi Waypoint standard referral slips.
 *
 * Security invariant (Phase 3D Part 6):
 * - Encodes ONLY the approved opaque referral lookup token (`MW-REF:<referenceCode>`).
 * - NEVER accepts or encodes patient name, phone number, diagnosis, or any PHI.
 * - Uses semantic design tokens (`bg-paper`, `fill-ink`) so `lint:tokens` passes with zero raw colors.
 */
export function buildReferralQrToken(referenceCode: string): string {
  const clean = referenceCode.trim().toUpperCase().replace(/^MW-REF:/i, "");
  return `MW-REF:${clean}`;
}

/** Deterministic 21x21 QR-style matrix with standard 7x7 finder patterns + timing strips + token bits. */
function buildMatrix(token: string): boolean[][] {
  const size = 21;
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const placeFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        reserved[rr][cc] = true;
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[rr][cc] = inOuter && (isBorder || isCore);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    reserved[6][i] = true;
    reserved[i][6] = true;
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Deterministic bit stream derived solely from the opaque token
  const bytes = Array.from(new TextEncoder().encode(token));
  let hash = 2166136261;
  for (const b of bytes) {
    hash ^= b;
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  const bits: boolean[] = [];
  for (const b of bytes) {
    for (let bit = 7; bit >= 0; bit--) {
      bits.push(((b >> bit) & 1) === 1);
    }
  }
  while (bits.length < size * size) {
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    for (let bit = 31; bit >= 0 && bits.length < size * size; bit--) {
      bits.push(((hash >> bit) & 1) === 1);
    }
  }

  let idx = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c]) {
        grid[r][c] = bits[idx++] ?? false;
      }
    }
  }
  return grid;
}

export interface QrCodeSvgProps {
  referenceCode: string;
  sizePx?: number;
  label: string;
}

export function QrCodeSvg({ referenceCode, sizePx = 128, label }: QrCodeSvgProps) {
  const token = buildReferralQrToken(referenceCode);
  const matrix = buildMatrix(token);
  const cells = matrix.length;
  const quiet = 2;
  const viewSize = cells + quiet * 2;

  return (
    <svg
      role="img"
      aria-label={`${label}: ${token}`}
      data-testid="referral-qr-svg"
      data-qr-payload={token}
      width={sizePx}
      height={sizePx}
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      className="shrink-0 border border-ink bg-paper"
    >
      {matrix.map((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect
              key={`${r}-${c}`}
              x={c + quiet}
              y={r + quiet}
              width={1}
              height={1}
              className="fill-ink"
            />
          ) : null
        )
      )}
    </svg>
  );
}
