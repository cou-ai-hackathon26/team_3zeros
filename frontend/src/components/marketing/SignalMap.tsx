"use client";

import React, { useId, useMemo, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { BookOpenText, Globe2, Languages, Network } from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { cn } from "../../lib/cn";

type RegionFilter = "all" | "asiaPacific" | "menaAfrica" | "europe" | "americas";

export interface SignalMapProps {
  locale: Locale;
  className?: string;
}

/**
 * Simplified 96x42 dotted world map silhouette (equirectangular projection,
 * lon -168..180, lat 78..-56). Precomputed into SVG dots once at module load
 * with zero external map dependencies and zero runtime network calls.
 */
const WORLD_MAP_ROWS = [
  "............................#############.......................................................",
  "...........................##############.............................#########.................",
  "..............#####.....###..##########.........................#####################...........",
  "..###################...#####..#######.............######...################################....",
  ".######################..####...#####...###......##############################################.",
  ".#######################........###.............####..#######################################...",
  "..#......###############....#................#..###..#######################################....",
  "..........###############.####...............#...#########################################......",
  "...........####################.............#########################################...##......",
  "............###################..............########################################...........",
  ".............################.................#######################################...........",
  ".............##############.................###...################################...#..........",
  ".............#############..................##....#...#########################.##..#...........",
  "..............###########....................####.......#######################..#.##...........",
  "...............##########...................#######.....########################..#.............",
  "................######.....................#################.##################.................",
  "................####.......................#################...################.................",
  ".................###...#..................####################...############..#................",
  "..................#####...................####################....###...####....................",
  ".....................#....................###################.....###....###...#................",
  "......................##..................################.........#.....###....................",
  ".......................#.#####.............#################.......##....#......#...............",
  ".........................######.............###############.........#....#......#...............",
  ".........................#######.................##########.............#.#..##.................",
  ".........................#########...............#########...............#..###.................",
  "........................###########..............#########................#.......###...........",
  ".........................############.............########..................##......##..........",
  ".........................###########..............#######.......................................",
  "..........................##########..............#######..#......................####..........",
  "..........................##########..............#######..#....................######..........",
  "...........................########...............######..##...................########.........",
  "...........................########...............######..#..................##########.........",
  "...........................######..................####......................###########........",
  "...........................######..................####......................###########........",
  "...........................#####...................###........................#...######........",
  "...........................####.....................................................###......#..",
  "..........................####................................................................#.",
  "..........................###.........................................................#......#..",
  "..........................##................................................................#...",
  "..........................##....................................................................",
  "...........................#....................................................................",
  "................................................................................................",
] as const;

const CELL_STEP = 10;
const MAP_WIDTH = WORLD_MAP_ROWS[0].length * CELL_STEP; // 960
const MAP_HEIGHT = WORLD_MAP_ROWS.length * CELL_STEP; // 420

interface MapHub {
  id: string;
  region: Exclude<RegionFilter, "all">;
  x: number;
  y: number;
  delay: number;
}

const ORIGIN_HUB = {
  id: "dhaka",
  x: 705,
  y: 166,
} as const;

const GLOBAL_HUBS: readonly MapHub[] = [
  { id: "singapore", region: "asiaPacific", x: 742, y: 235, delay: 0.1 },
  { id: "tokyo", region: "asiaPacific", x: 840, y: 129, delay: 0.25 },
  { id: "sydney", region: "asiaPacific", x: 871, y: 342, delay: 0.45 },
  { id: "auckland", region: "asiaPacific", x: 936, y: 351, delay: 0.6 },
  { id: "dubai", region: "menaAfrica", x: 610, y: 162, delay: 0.15 },
  { id: "nairobi", region: "menaAfrica", x: 559, y: 243, delay: 0.35 },
  { id: "lagos", region: "menaAfrica", x: 468, y: 219, delay: 0.5 },
  { id: "johannesburg", region: "menaAfrica", x: 535, y: 319, delay: 0.65 },
  { id: "berlin", region: "europe", x: 495, y: 78, delay: 0.2 },
  { id: "london", region: "europe", x: 458, y: 81, delay: 0.4 },
  { id: "newyork", region: "americas", x: 257, y: 114, delay: 0.55 },
  { id: "sanfrancisco", region: "americas", x: 124, y: 123, delay: 0.72 },
  { id: "saopaulo", region: "americas", x: 331, y: 311, delay: 0.68 },
];

interface LandDot {
  x: number;
  y: number;
  isOriginCluster: boolean;
}

const LAND_DOTS: readonly LandDot[] = (() => {
  const dots: LandDot[] = [];
  for (let r = 0; r < WORLD_MAP_ROWS.length; r++) {
    const row = WORLD_MAP_ROWS[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] === "#") {
        const x = c * CELL_STEP + CELL_STEP / 2;
        const y = r * CELL_STEP + CELL_STEP / 2;
        const distToOrigin = Math.hypot(x - ORIGIN_HUB.x, y - ORIGIN_HUB.y);
        dots.push({ x, y, isOriginCluster: distToOrigin <= 54 });
      }
    }
  }
  return dots;
})();

function arcPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const lift = Math.min(130, Math.max(28, dist * 0.28));
  const cy = Math.max(12, my - lift);
  return `M ${x1} ${y1} Q ${mx.toFixed(1)} ${cy.toFixed(1)} ${x2} ${y2}`;
}

const PILLARS = [
  { key: "languages", Icon: Languages },
  { key: "knowledge", Icon: BookOpenText },
  { key: "handover", Icon: Network },
] as const;

const REGION_OPTIONS: readonly RegionFilter[] = [
  "all",
  "asiaPacific",
  "menaAfrica",
  "europe",
  "americas",
];

/**
 * Interactive dotted world signal map inspired by React Bits Signal Map, styled
 * natively in Medi Waypoint's warm editorial paper/surface/indigo palette to
 * illustrate planned future expansion radiating outward from Bangladesh.
 *
 * - Runs automatically and continuously whenever scrolled into view (pauses off-screen).
 * - Filterable by planned region; uses semantic palette tokens only (`lint:tokens`).
 * - Honours `prefers-reduced-motion` with a static map and arcs.
 */
export function SignalMap({ locale, className }: SignalMapProps) {
  const prefersReduced = Boolean(useReducedMotion());
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: false, amount: 0.15 });
  const gradId = useId().replace(/:/g, "");

  const [region, setRegion] = useState<RegionFilter>("all");

  const E = (k: string) => t(locale, `landing.expansion.${k}`);

  const visibleHubs = useMemo(
    () => (region === "all" ? GLOBAL_HUBS : GLOBAL_HUBS.filter((h) => h.region === region)),
    [region],
  );

  const shouldAnimate = !prefersReduced && isInView;

  const handleRegionChange = (next: RegionFilter) => {
    setRegion(next);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-line bg-surface p-6 text-ink shadow-raised sm:p-8 lg:p-10",
        className,
      )}
    >
      {/* Header row */}
      <div className="flex max-w-2xl flex-col gap-2.5">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-indigo-wash px-3.5 py-1 text-caption font-semibold text-indigo">
          <Globe2 aria-hidden="true" className="size-3.5" />
          <span>{E("eyebrow")}</span>
        </span>
        <h2
          id="expansion-title"
          tabIndex={-1}
          className="m-0 font-serif text-title tracking-[-0.025em] text-balance text-ink outline-none md:text-[36px] md:leading-[1.15] xl:text-[40px]"
        >
          {E("title")}
        </h2>
        <p className="m-0 text-body leading-relaxed text-ink-muted">
          {E("subtitle")}
        </p>
      </div>

      {/* Region filter pills + Legend */}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label={E("regions.label")}
          className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-pill border border-line bg-sunken p-1"
        >
          {REGION_OPTIONS.map((opt) => {
            const active = region === opt;
            return (
              <button
                key={opt}
                type="button"
                aria-pressed={active}
                onClick={() => handleRegionChange(opt)}
                className={cn(
                  "min-h-9 cursor-pointer rounded-pill border-0 px-3.5 text-caption font-semibold transition-colors duration-[var(--motion-feedback-duration)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo",
                  active
                    ? "bg-indigo text-surface"
                    : "bg-transparent text-ink-muted hover:bg-surface hover:text-ink",
                )}
              >
                {E(`regions.${opt}`)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-caption text-ink-muted">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 rounded-pill bg-positive ring-4 ring-positive-wash" />
            <span className="font-medium text-ink">{E("legendOrigin")}</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 rounded-pill bg-indigo ring-4 ring-indigo-wash" />
            <span>{E("legendPlanned")}</span>
          </span>
        </div>
      </div>

      {/* Dotted World Signal Map Canvas */}
      <div
        role="img"
        aria-label={E("mapLabel")}
        className="relative mt-6 overflow-hidden rounded-[22px] border border-line/80 bg-paper px-2 py-4 sm:px-5 sm:py-6"
      >
        <svg
          key={`${region}-${shouldAnimate ? "active" : "paused"}`}
          aria-hidden="true"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          fill="none"
          className="block h-auto w-full select-none"
        >
          <defs>
            {visibleHubs.map((hub) => {
              const goingLeft = hub.x < ORIGIN_HUB.x;
              return (
                <linearGradient
                  key={hub.id}
                  id={`${gradId}-${hub.id}`}
                  x1={goingLeft ? "100%" : "0%"}
                  y1="0%"
                  x2={goingLeft ? "0%" : "100%"}
                  y2="0%"
                >
                  <stop offset="0%" stopColor="var(--color-positive)" stopOpacity="0.95" />
                  <stop offset="45%" stopColor="var(--color-indigo)" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="var(--color-indigo)" stopOpacity="0.25" />
                </linearGradient>
              );
            })}
          </defs>

          {/* World land dots */}
          <g>
            {LAND_DOTS.map((dot, idx) => (
              <circle
                key={idx}
                cx={dot.x}
                cy={dot.y}
                r={2.2}
                className={dot.isOriginCluster ? "fill-indigo/40" : "fill-line"}
              />
            ))}
          </g>

          {/* Subtle static base arcs */}
          <g>
            {visibleHubs.map((hub) => (
              <path
                key={`base-${hub.id}`}
                d={arcPath(ORIGIN_HUB.x, ORIGIN_HUB.y, hub.x, hub.y)}
                className="stroke-indigo/15"
                strokeWidth="1.2"
                strokeDasharray="3 4"
              />
            ))}
          </g>

          {/* Animated continuous signal arcs radiating from Dhaka, Bangladesh */}
          <g>
            {visibleHubs.map((hub) => {
              const d = arcPath(ORIGIN_HUB.x, ORIGIN_HUB.y, hub.x, hub.y);
              if (prefersReduced) {
                return (
                  <path
                    key={`static-${hub.id}`}
                    d={d}
                    stroke={`url(#${gradId}-${hub.id})`}
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                );
              }
              const cycleDelay = hub.delay * 2.2;
              const repeatDelay = 1.6 + (Math.round(hub.delay * 10) % 4) * 0.45;
              return (
                <motion.path
                  key={`arc-${hub.id}`}
                  d={d}
                  stroke={`url(#${gradId}-${hub.id})`}
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={
                    shouldAnimate
                      ? {
                          pathLength: [0, 1, 1],
                          opacity: [0, 0.95, 0],
                        }
                      : { pathLength: 0, opacity: 0 }
                  }
                  transition={{
                    duration: 2.1,
                    times: [0, 0.62, 1],
                    delay: cycleDelay,
                    repeat: shouldAnimate ? Infinity : 0,
                    repeatDelay,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              );
            })}
          </g>

          {/* Destination hub beacons (all global dots subtly shown, active region emphasized) */}
          <g>
            {GLOBAL_HUBS.map((hub) => {
              const highlighted = region === "all" || hub.region === region;
              const cycleDelay = hub.delay * 2.2;
              const repeatDelay = 1.6 + (Math.round(hub.delay * 10) % 4) * 0.45;
              return (
                <g key={`hub-${hub.id}`}>
                  {highlighted && !prefersReduced && shouldAnimate && (
                    <motion.circle
                      cx={hub.x}
                      cy={hub.y}
                      r={4}
                      className="fill-none stroke-indigo"
                      strokeWidth="1.5"
                      initial={{ r: 3.5, opacity: 0 }}
                      animate={{ r: [3.5, 14], opacity: [0, 0.75, 0] }}
                      transition={{
                        duration: 1.1,
                        times: [0, 0.2, 1],
                        delay: cycleDelay + 1.15,
                        repeat: Infinity,
                        repeatDelay: repeatDelay + 1.0,
                        ease: "easeOut",
                      }}
                    />
                  )}
                  <circle
                    cx={hub.x}
                    cy={hub.y}
                    r={highlighted ? 6.5 : 4}
                    className={highlighted ? "fill-indigo/15" : "fill-line/40"}
                  />
                  <circle
                    cx={hub.x}
                    cy={hub.y}
                    r={highlighted ? 3.5 : 2.3}
                    className={highlighted ? "fill-indigo" : "fill-line-strong/60"}
                  />
                </g>
              );
            })}
          </g>

          {/* Origin hub: Dhaka, Bangladesh */}
          <g>
            {!prefersReduced && shouldAnimate && (
              <motion.circle
                cx={ORIGIN_HUB.x}
                cy={ORIGIN_HUB.y}
                r={6}
                className="fill-none stroke-positive"
                strokeWidth="1.75"
                initial={{ r: 5, opacity: 0.85 }}
                animate={{ r: [5, 22], opacity: [0.85, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.8, ease: "easeOut" }}
              />
            )}
            <circle cx={ORIGIN_HUB.x} cy={ORIGIN_HUB.y} r={9.5} className="fill-positive/20" />
            <circle
              cx={ORIGIN_HUB.x}
              cy={ORIGIN_HUB.y}
              r={4.8}
              className="fill-positive stroke-surface"
              strokeWidth="1.75"
            />
          </g>
        </svg>

        {/* Subtle Origin Badge anchored cleanly in corner */}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line/65 pt-3 text-caption text-ink-muted">
          <span className="inline-flex items-center gap-2 font-semibold text-ink">
            <span aria-hidden="true" className="size-2 rounded-pill bg-positive" />
            <span>{E("originBadge")}</span>
          </span>
          <span className="text-end">{E("note")}</span>
        </div>
      </div>

      {/* Three grounded future-work pillars */}
      <div className="mt-7 grid gap-5 md:grid-cols-3">
        {PILLARS.map(({ key, Icon }) => (
          <div
            key={key}
            className="flex flex-col gap-2.5 rounded-tile border border-line/75 bg-sunken/60 p-5"
          >
            <span
              aria-hidden="true"
              className="inline-flex size-9 items-center justify-center rounded-panel bg-surface text-indigo ring-1 ring-line/70"
            >
              <Icon className="size-4.5" />
            </span>
            <h3 className="m-0 text-subheading font-semibold text-ink">
              {E(`pillars.${key}.title`)}
            </h3>
            <p className="m-0 text-dense leading-relaxed text-ink-muted">
              {E(`pillars.${key}.text`)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
