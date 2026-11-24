"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  AudioLines,
  BookOpenText,
  Building2,
  Check,
  FileCheck2,
  Loader2,
  Mic,
  Minus,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { cn } from "../../lib/cn";

type Scenario = "routine" | "emergency";
type StageKey = "intake" | "rules" | "rag" | "voiceReply" | "summary";
type NodeState = "pending" | "running" | "done" | "alert" | "skipped";

export interface TriagePipelineProps {
  locale: Locale;
  className?: string;
}

const PHASE_TIMINGS_MS = [750, 800, 850, 900] as const;
const CYCLE_HOLD_MS = 2200;

function getNodeState(stage: StageKey, phase: number, scenario: Scenario): NodeState {
  if (stage === "intake") {
    if (phase === 0) return "running";
    return "done";
  }
  if (stage === "rules") {
    if (phase < 1) return "pending";
    if (phase === 1) return "running";
    return scenario === "emergency" ? "alert" : "done";
  }
  if (stage === "rag") {
    if (phase < 2) return "pending";
    if (scenario === "emergency") return "skipped";
    if (phase === 2) return "running";
    return "done";
  }
  // Parallel branch outputs (voiceReply & summary run together in phase 3)
  if (phase < 3) return "pending";
  if (phase === 3) return "running";
  return scenario === "emergency" ? "alert" : "done";
}

function getStageIcon(stage: StageKey, scenario: Scenario): LucideIcon {
  switch (stage) {
    case "intake":
      return Mic;
    case "rules":
      return ShieldAlert;
    case "rag":
      return BookOpenText;
    case "voiceReply":
      return scenario === "emergency" ? AlertTriangle : AudioLines;
    case "summary":
      return scenario === "emergency" ? Building2 : FileCheck2;
  }
}

interface NodeCardProps {
  stage: StageKey;
  title: string;
  subtitle: string;
  statusText: string;
  state: NodeState;
  selected: boolean;
  icon: LucideIcon;
  reducedMotion: boolean;
  onSelect: () => void;
}

function PipelineNodeCard({
  title,
  subtitle,
  statusText,
  state,
  selected,
  icon: Icon,
  reducedMotion,
  onSelect,
}: NodeCardProps) {
  const isRunning = state === "running";
  const isAlert = state === "alert";
  const isSkipped = state === "skipped";
  const isPending = state === "pending";

  const displaySubtitle = isRunning || isPending ? statusText : subtitle;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      initial={false}
      animate={
        reducedMotion
          ? { opacity: isPending ? 0.7 : isSkipped ? 0.78 : 1 }
          : {
              opacity: isPending ? 0.68 : isSkipped ? 0.78 : 1,
              scale: isRunning ? 1.015 : 1,
            }
      }
      transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn(
        "group relative flex w-full cursor-pointer items-center gap-3.5 rounded-tile border px-4 py-3.5 text-start transition-colors duration-[var(--motion-state-duration)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo",
        isRunning && "border-indigo bg-surface shadow-raised ring-2 ring-indigo/20",
        state === "done" && "border-line bg-surface shadow-raised hover:border-indigo/45",
        isAlert && "border-signal/60 bg-signal-wash/60 shadow-raised ring-1 ring-signal/25 hover:border-signal",
        isSkipped && "border-dashed border-line bg-sunken/70 hover:border-line-strong",
        isPending && "border-line/75 bg-surface/80 hover:border-line-strong",
        selected && !isAlert && "border-indigo ring-2 ring-indigo/35 ring-offset-2 ring-offset-paper",
        selected && isAlert && "border-signal ring-2 ring-signal/40 ring-offset-2 ring-offset-paper",
      )}
    >
      {/* Icon box with corner status pill */}
      <span
        aria-hidden="true"
        className={cn(
          "relative flex size-10 shrink-0 items-center justify-center rounded-panel border transition-colors duration-[var(--motion-state-duration)]",
          isRunning
            ? "border-indigo/30 bg-indigo-wash text-indigo"
            : isAlert
              ? "border-signal/30 bg-signal-wash text-signal"
              : state === "done"
                ? "border-line/70 bg-indigo-wash/60 text-indigo"
                : "border-line/70 bg-sunken text-ink-muted",
        )}
      >
        <Icon className="size-4.5" strokeWidth={1.9} />
        <span
          className={cn(
            "absolute -bottom-1 -end-1 flex size-4.5 items-center justify-center rounded-pill ring-2 ring-surface",
            state === "done" && "bg-positive text-surface",
            isRunning && "bg-indigo text-surface",
            isAlert && "bg-signal text-surface",
            isSkipped && "bg-line-strong text-surface",
            isPending && "bg-line text-ink-muted",
          )}
        >
          {state === "done" && <Check className="size-2.5" strokeWidth={3} />}
          {isRunning && (
            <Loader2 className={cn("size-2.5", !reducedMotion && "animate-spin")} strokeWidth={3} />
          )}
          {isAlert && <AlertTriangle className="size-2.5" strokeWidth={2.75} />}
          {isSkipped && <Minus className="size-2.5" strokeWidth={3} />}
          {isPending && <span className="size-1.5 rounded-pill bg-ink-muted/60" />}
        </span>
      </span>

      {/* Title & live status / sample output */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-dense font-semibold text-ink">
          {title}
        </span>
        <span
          className={cn(
            "truncate text-caption transition-colors duration-[var(--motion-state-duration)]",
            isRunning
              ? "font-semibold text-indigo"
              : isAlert
                ? "font-semibold text-signal"
                : "text-ink-muted",
          )}
        >
          {displaySubtitle}
        </span>
      </span>
    </motion.button>
  );
}

function HorizontalEdge({
  active,
  urgent,
  reducedMotion,
}: {
  active: boolean;
  urgent: boolean;
  reducedMotion: boolean;
}) {
  const strokeClass = urgent ? "stroke-signal" : "stroke-indigo";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 56 24"
      fill="none"
      preserveAspectRatio="none"
      className="hidden h-6 w-full lg:block"
    >
      <path
        d="M 0 12 H 56"
        className="stroke-line"
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
      />
      {active &&
        (reducedMotion ? (
          <path
            d="M 0 12 H 56"
            className={strokeClass}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <>
            <motion.path
              d="M 0 12 H 56"
              className={strokeClass}
              strokeWidth="2.25"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0, opacity: 0.45 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.65, 0, 0.35, 1] }}
            />
            <motion.circle
              cy="12"
              r="3"
              className={urgent ? "fill-signal" : "fill-indigo"}
              initial={{ cx: 0, opacity: 0 }}
              animate={{ cx: [0, 56], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1] }}
            />
          </>
        ))}
    </svg>
  );
}

function BranchForkEdge({
  active,
  urgent,
  reducedMotion,
}: {
  active: boolean;
  urgent: boolean;
  reducedMotion: boolean;
}) {
  const strokeClass = urgent ? "stroke-signal" : "stroke-indigo";
  const topPath = "M 0 100 H 22 C 34 100 34 46 46 46 H 72";
  const bottomPath = "M 0 100 H 22 C 34 100 34 154 46 154 H 72";

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 72 200"
      fill="none"
      preserveAspectRatio="none"
      className="hidden h-full w-full lg:block"
    >
      <path
        d={topPath}
        className="stroke-line"
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={bottomPath}
        className="stroke-line"
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
      />
      {active &&
        (reducedMotion ? (
          <>
            <path
              d={topPath}
              className={strokeClass}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={bottomPath}
              className={strokeClass}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          <>
            <motion.path
              d={topPath}
              className={strokeClass}
              strokeWidth="2.25"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0, opacity: 0.45 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1] }}
            />
            <motion.path
              d={bottomPath}
              className={strokeClass}
              strokeWidth="2.25"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0, opacity: 0.45 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.55, delay: 0.08, ease: [0.65, 0, 0.35, 1] }}
            />
          </>
        ))}
    </svg>
  );
}

function VerticalEdge({
  active,
  urgent,
  reducedMotion,
}: {
  active: boolean;
  urgent: boolean;
  reducedMotion: boolean;
}) {
  const strokeClass = urgent ? "stroke-signal" : "stroke-indigo";
  return (
    <div aria-hidden="true" className="flex justify-center py-0.5 lg:hidden">
      <svg viewBox="0 0 24 28" fill="none" className="h-7 w-6">
        <path d="M 12 0 V 28" className="stroke-line" strokeWidth="1.75" />
        {active &&
          (reducedMotion ? (
            <path d="M 12 0 V 28" className={strokeClass} strokeWidth="2" />
          ) : (
            <motion.path
              d="M 12 0 V 28"
              className={strokeClass}
              strokeWidth="2.25"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, ease: [0.65, 0, 0.35, 1] }}
            />
          ))}
      </svg>
    </div>
  );
}

/**
 * Interactive workflow graph inspired by React Bits Pipeline, styled natively in
 * Medi Waypoint's warm editorial paper/surface/indigo palette and grounded in the
 * real backend triage RAG pipeline (`apps/triage/rules/engine.py`,
 * `apps/knowledge/search.py`, `apps/triage/context.py`, `apps/triage/dialogue.py`).
 *
 * - Plays once when scrolled into view (no infinite ambient loop).
 * - Replayable on demand and switchable between Routine RAG and Emergency Override pathways.
 * - Uses semantic palette tokens only (passes `lint:tokens`), honours `prefers-reduced-motion`.
 */
export function TriagePipeline({ locale, className }: TriagePipelineProps) {
  const prefersReduced = Boolean(useReducedMotion());
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: false, amount: 0.2 });

  const [scenario, setScenario] = useState<Scenario>("routine");
  const [cycleId, setCycleId] = useState(0);
  const [phase, setPhase] = useState<number>(prefersReduced ? 4 : 0);
  const [selectedStage, setSelectedStage] = useState<StageKey>("rag");

  const P = (k: string) => t(locale, `landing.how.pipeline.${k}`);

  useEffect(() => {
    if (prefersReduced) {
      setPhase(4);
      return;
    }
    if (!isInView) {
      return;
    }

    let cancelled = false;
    let timers: ReturnType<typeof setTimeout>[] = [];

    const runCycle = () => {
      if (cancelled) return;
      timers.forEach(clearTimeout);
      timers = [];
      setPhase(0);
      setCycleId((n) => n + 1);

      let elapsed = 0;
      PHASE_TIMINGS_MS.forEach((stepMs, idx) => {
        elapsed += stepMs;
        timers.push(
          setTimeout(() => {
            if (!cancelled) setPhase(idx + 1);
          }, elapsed),
        );
      });

      timers.push(
        setTimeout(() => {
          if (!cancelled) runCycle();
        }, elapsed + CYCLE_HOLD_MS),
      );
    };

    runCycle();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [isInView, scenario, prefersReduced]);

  const handleScenarioChange = (next: Scenario) => {
    if (next === scenario) return;
    setScenario(next);
    setSelectedStage(next === "emergency" ? "rules" : "rag");
  };

  const renderNode = (stage: StageKey) => {
    const state = getNodeState(stage, phase, scenario);
    const statusText =
      state === "running"
        ? P("status.running")
        : state === "pending"
          ? P("status.waiting")
          : P(`status.${state}`);

    return (
      <PipelineNodeCard
        stage={stage}
        title={P(`${scenario}.${stage}.title`)}
        subtitle={P(`${scenario}.${stage}.subtitle`)}
        statusText={statusText}
        state={state}
        selected={selectedStage === stage}
        icon={getStageIcon(stage, scenario)}
        reducedMotion={prefersReduced}
        onSelect={() => setSelectedStage(stage)}
      />
    );
  };

  const SelectedIcon = getStageIcon(selectedStage, scenario);
  const selectedState = getNodeState(selectedStage, phase, scenario);
  const isEmergency = scenario === "emergency";

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={P("regionLabel")}
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-line bg-surface p-6 text-ink shadow-raised sm:p-8 lg:p-10",
        className,
      )}
    >
      {/* Top header & pathway controls */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-2xl flex-col gap-2.5">
          <span className="inline-flex w-fit items-center rounded-pill bg-indigo-wash px-3.5 py-1 text-caption font-semibold text-indigo">
            {P("eyebrow")}
          </span>
          <h3 className="m-0 font-serif text-title tracking-[-0.02em] text-balance text-ink">
            {P("title")}
          </h3>
          <p className="m-0 text-dense leading-relaxed text-ink-muted">
            {P("subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            role="group"
            aria-label={P("scenarios.label")}
            className="inline-flex items-center gap-1 rounded-pill border border-line bg-sunken p-1"
          >
            {(["routine", "emergency"] as const).map((opt) => {
              const active = scenario === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleScenarioChange(opt)}
                  className={cn(
                    "min-h-9 cursor-pointer rounded-pill border-0 px-3.5 text-caption font-semibold transition-colors duration-[var(--motion-feedback-duration)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo",
                    active
                      ? opt === "emergency"
                        ? "bg-signal text-surface"
                        : "bg-indigo text-surface"
                      : "bg-transparent text-ink-muted hover:bg-surface hover:text-ink",
                  )}
                >
                  {P(`scenarios.${opt}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Workflow Graph Canvas on warm paper blueprint grid */}
      <div
        className="mt-8 rounded-[22px] border border-line/85 bg-paper p-4 sm:p-6 lg:px-7 lg:py-9"
        style={{
          backgroundImage: "radial-gradient(var(--color-line) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <div
          key={`${scenario}-${cycleId}`}
          className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)_3rem_minmax(0,1fr)_4.25rem_minmax(0,1.08fr)] lg:items-center"
        >
          {/* Stage 1: Voice Symptom Intake */}
          <div className="w-full">{renderNode("intake")}</div>

          {/* Connector 1 -> 2 */}
          <HorizontalEdge active={phase >= 1} urgent={false} reducedMotion={prefersReduced} />
          <VerticalEdge active={phase >= 1} urgent={false} reducedMotion={prefersReduced} />

          {/* Stage 2: Deterministic Red-Flag Rules Check */}
          <div className="w-full">{renderNode("rules")}</div>

          {/* Connector 2 -> 3 */}
          <HorizontalEdge
            active={phase >= 2}
            urgent={isEmergency}
            reducedMotion={prefersReduced}
          />
          <VerticalEdge
            active={phase >= 2}
            urgent={isEmergency}
            reducedMotion={prefersReduced}
          />

          {/* Stage 3: Approved Medical Book RAG Lookup */}
          <div className="w-full">{renderNode("rag")}</div>

          {/* Branching Y-Fork Connector 3 -> [Branch A, Branch B] */}
          <div className="hidden h-full self-stretch lg:block">
            <BranchForkEdge
              active={phase >= 3}
              urgent={isEmergency}
              reducedMotion={prefersReduced}
            />
          </div>
          <VerticalEdge
            active={phase >= 3}
            urgent={isEmergency}
            reducedMotion={prefersReduced}
          />

          {/* Stage 4: Parallel Output Branches */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-1 lg:gap-4">
            {renderNode("voiceReply")}
            {renderNode("summary")}
          </div>
        </div>
      </div>

      {/* Selected Stage Inspector + Honest Sample Caption */}
      <div
        role="status"
        aria-live="polite"
        aria-label={P("inspectorLabel")}
        className="mt-5 flex flex-col gap-3 rounded-tile border border-line/80 bg-sunken/70 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-5"
      >
        <motion.div
          key={`${scenario}-${selectedStage}`}
          initial={prefersReduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          className="flex items-start gap-3.5"
        >
          <span
            aria-hidden="true"
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-panel border",
              selectedState === "alert"
                ? "border-signal/30 bg-signal-wash text-signal"
                : "border-indigo/25 bg-indigo-wash text-indigo",
            )}
          >
            <SelectedIcon className="size-4" />
          </span>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-dense font-semibold text-ink">
                {P(`${scenario}.${selectedStage}.title`)}
              </span>
              <span
                className={cn(
                  "inline-flex rounded-pill px-2.5 py-0.5 text-caption font-semibold",
                  selectedState === "alert"
                    ? "bg-signal-wash text-signal ring-1 ring-signal/25"
                    : "bg-surface text-indigo ring-1 ring-indigo/20",
                )}
              >
                {P(`${scenario}.${selectedStage}.tag`)}
              </span>
            </div>
            <p className="m-0 max-w-3xl text-dense leading-relaxed text-ink-muted">
              {P(`${scenario}.${selectedStage}.detail`)}
            </p>
          </div>
        </motion.div>
      </div>

      <p className="m-0 mt-4 text-caption text-ink-muted">
        {P("sampleNote")}
      </p>
    </div>
  );
}
