"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  TemporalStripModel,
  TemporalStripPoint,
  TemporalStripProps,
  TemporalStripSpan,
  TemporalStripState,
} from "@/lib/design-system/temporal-strip-contract";
import {
  percentOnTrack,
  selectVisibleTickLabels,
} from "@/lib/design-system/temporal-strip-math";

function spanFill(state: TemporalStripState, selected: boolean): string {
  if (selected || state === "selected") {
    return "bg-amber-500/90 text-amber-950 ring-1 ring-amber-700";
  }
  if (state === "attention") {
    return "bg-amber-200/90 text-amber-950 ring-1 ring-amber-500";
  }
  if (state === "inactive" || state === "past") {
    return "bg-zinc-200/90 text-zinc-600";
  }
  // Soft Build amber — span, not a form field.
  return "bg-amber-100/90 text-zinc-800";
}

function pointMarker(state: TemporalStripState, selected: boolean): string {
  if (selected || state === "selected") {
    return "bg-amber-800 border-amber-950";
  }
  if (state === "attention") {
    return "bg-amber-500 border-amber-700";
  }
  if (state === "inactive") {
    return "bg-zinc-400 border-zinc-500";
  }
  return "bg-zinc-900 border-zinc-950";
}

function listItems(model: TemporalStripModel): Array<{ id: string; text: string }> {
  const items: Array<{ id: string; text: string }> = [];
  for (const span of model.spans) {
    if (span.kind === "period") continue;
    items.push({
      id: span.id,
      text: `${span.label} — phase from offset ${span.startOffset} to ${span.endOffset}${span.detail ? ` (${span.detail})` : ""}`,
    });
  }
  for (const point of model.points) {
    const subs = point.sublabels?.length ? ` · ${point.sublabels.join("; ")}` : "";
    items.push({
      id: point.id,
      text: `${point.label} — key time at offset ${point.offset}${subs}${point.detail ? ` (${point.detail})` : ""}`,
    });
  }
  return items;
}

/**
 * TemporalStrip — operational instrument / time rail.
 * Visual explanation of configured time; not a Gantt editor.
 * Math stays in temporal-strip-math / adapters.
 */
export function TemporalStrip({
  model,
  density = "compact",
  className = "",
  interactive = false,
  onSelect,
  listFallback = "sr-only",
}: TemporalStripProps) {
  const duration = Math.max(model.durationMinutes, 1);
  const laneCount = Math.max(
    1,
    ...model.spans.filter((s) => s.kind === "phase").map((s) => (s.lane ?? 0) + 1),
  );
  const spanH = density === "comfortable" ? 22 : 18;
  const laneGap = 4;
  const labelBand = 22;
  const railBand = 14;
  const aboveSpanBand = Math.max(0, (laneCount - 1) * (spanH + laneGap));
  const chartHeight = labelBand + aboveSpanBand + railBand + labelBand + 28;

  const phases = model.spans.filter((s) => s.kind === "phase");
  const railY = labelBand + aboveSpanBand + railBand / 2;
  const allTicks = model.ticks ?? [];

  const trackRef = useRef<HTMLDivElement>(null);
  // null = not measured yet → treat as wide so SSR/hydration keep dense desktop labels.
  const [trackWidthPx, setTrackWidthPx] = useState<number | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      setTrackWidthPx((prev) => (prev === next ? prev : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const labeledTicks = useMemo(() => {
    if (allTicks.length === 0) return [];
    const width = trackWidthPx ?? 960;
    return selectVisibleTickLabels({
      ticks: allTicks,
      durationMinutes: duration,
      trackWidthPx: width,
      minLabelWidthPx: 76,
    });
  }, [allTicks, duration, trackWidthPx]);

  return (
    <div
      className={`min-w-0 ${className}`.trim()}
      data-testid="temporal-strip"
      role="region"
      aria-label={model.ariaLabel}
    >
      <div className="overflow-x-auto overscroll-x-contain">
        <div ref={trackRef} className="relative w-full min-w-0 px-1 pb-1 pt-1">
          <div
            className="pointer-events-none relative h-5 text-[10px] tabular-nums leading-none text-zinc-500"
            aria-hidden
            data-testid="temporal-strip-tick-labels"
          >
            {labeledTicks.map((tick, index, arr) => {
              const pct = percentOnTrack(tick.offset, duration);
              const align =
                index === 0
                  ? "translate-x-0"
                  : index === arr.length - 1
                    ? "-translate-x-full"
                    : "-translate-x-1/2";
              return (
                <span
                  key={`${tick.offset}-${tick.label}`}
                  className={`absolute top-0 whitespace-nowrap ${align}`}
                  style={{ left: `${pct}%` }}
                  data-testid="temporal-tick-label"
                >
                  {tick.label}
                </span>
              );
            })}
            {!allTicks.length && model.scaleStartLabel ? (
              <>
                <span className="absolute left-0 whitespace-nowrap">{model.scaleStartLabel}</span>
                {model.scaleEndLabel ? (
                  <span className="absolute right-0 whitespace-nowrap">{model.scaleEndLabel}</span>
                ) : null}
              </>
            ) : null}
          </div>

          <div
            className="relative rounded-md bg-zinc-50/80"
            style={{ height: chartHeight }}
            data-testid="temporal-strip-track"
          >
            {allTicks.map((tick) => (
              <div
                key={`guide-${tick.offset}`}
                className="pointer-events-none absolute bottom-6 top-1 w-px bg-zinc-200/70"
                style={{ left: `${percentOnTrack(tick.offset, duration)}%` }}
                aria-hidden
              />
            ))}

            <div
              className="absolute inset-x-0 h-0.5 bg-zinc-400"
              style={{ top: railY }}
              aria-hidden
              data-testid="temporal-strip-rail"
            />
            {allTicks.map((tick) => (
              <div
                key={`stub-${tick.offset}`}
                className="pointer-events-none absolute h-2 w-px -translate-x-1/2 bg-zinc-500"
                style={{
                  left: `${percentOnTrack(tick.offset, duration)}%`,
                  top: railY - 4,
                }}
                aria-hidden
              />
            ))}

            {phases.map((span) => (
              <PhaseSpan
                key={span.id}
                span={span}
                duration={duration}
                spanH={spanH}
                laneGap={laneGap}
                railY={railY}
                selected={model.selectedId === span.id}
                interactive={interactive}
                onSelect={onSelect}
              />
            ))}

            {model.points.map((point, index) => (
              <KeyTimePoint
                key={point.id}
                point={point}
                duration={duration}
                railY={railY}
                labelAbove={index % 2 === 1}
                selected={model.selectedId === point.id}
                interactive={interactive}
                onSelect={onSelect}
              />
            ))}

            {model.now ? (
              <div
                className="absolute top-4 bottom-2 z-20 w-0.5 bg-zinc-900"
                style={{ left: `${percentOnTrack(model.now.offset, duration)}%` }}
                title={model.now.label ?? "Now"}
                aria-hidden
              />
            ) : null}
          </div>
        </div>
      </div>

      {listFallback !== false ? (
        <TemporalListFallback
          model={model}
          className={listFallback === "sr-only" ? "sr-only" : "mt-3"}
        />
      ) : null}
    </div>
  );
}

function PhaseSpan({
  span,
  duration,
  spanH,
  laneGap,
  railY,
  selected,
  interactive,
  onSelect,
}: {
  span: TemporalStripSpan;
  duration: number;
  spanH: number;
  laneGap: number;
  railY: number;
  selected: boolean;
  interactive: boolean;
  onSelect?: (id: string) => void;
}) {
  const left = percentOnTrack(span.startOffset, duration);
  const width = Math.max(percentOnTrack(span.endOffset - span.startOffset, duration), 1.2);
  const lane = span.lane ?? 0;
  // Lane 0 sits just above the rail; higher lanes stack upward.
  const top = railY - 2 - (lane + 1) * (spanH + laneGap) + laneGap;
  const fill = spanFill(span.state, selected);
  const title = [
    span.label,
    span.detail,
    span.outOfRange ? "Outside parent period" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const className = `absolute z-10 flex items-center overflow-hidden rounded-sm px-1.5 text-[10px] font-medium leading-tight ${fill} ${
    span.outOfRange ? "ring-1 ring-amber-600" : ""
  }`;

  const style = {
    left: `${left}%`,
    width: `${width}%`,
    top,
    height: spanH,
  };

  if (interactive && onSelect) {
    return (
      <button
        type="button"
        data-testid="temporal-span"
        data-temporal-id={span.id}
        title={title}
        aria-label={`Phase ${span.label}`}
        aria-pressed={selected}
        className={`${className} cursor-pointer touch-manipulation text-left hover:brightness-95`}
        style={style}
        onClick={() => onSelect(span.id)}
      >
        <span className="truncate">{span.label}</span>
      </button>
    );
  }

  return (
    <div
      data-testid="temporal-span"
      data-temporal-id={span.id}
      title={title}
      className={className}
      style={style}
    >
      <span className="truncate">{span.label}</span>
    </div>
  );
}

function KeyTimePoint({
  point,
  duration,
  railY,
  labelAbove,
  selected,
  interactive,
  onSelect,
}: {
  point: TemporalStripPoint;
  duration: number;
  railY: number;
  labelAbove: boolean;
  selected: boolean;
  interactive: boolean;
  onSelect?: (id: string) => void;
}) {
  const left = percentOnTrack(point.offset, duration);
  const marker = pointMarker(point.state, selected);
  const title = [
    point.label,
    ...(point.sublabels ?? []),
    point.detail,
    point.outOfRange ? "Outside parent period" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const labelBlock = (
    <span className="flex max-w-[8.5rem] flex-col items-center text-center">
      <span className="truncate text-[10px] font-semibold text-zinc-900">{point.label}</span>
      {point.detail ? (
        <span className="truncate text-[9px] tabular-nums text-zinc-500">{point.detail}</span>
      ) : null}
      {point.sublabels && point.sublabels.length > 0 ? (
        <span className="truncate text-[9px] text-zinc-500">{point.sublabels.join(" · ")}</span>
      ) : null}
    </span>
  );

  const body = (
    <span className="flex flex-col items-center gap-0.5">
      {labelAbove ? labelBlock : null}
      {labelAbove ? <span className="h-2 w-px bg-zinc-700" aria-hidden /> : null}
      <span
        className={`h-2.5 w-2.5 rotate-45 border shadow-sm ${marker}`}
        aria-hidden
        data-testid="temporal-point-marker"
      />
      {!labelAbove ? <span className="h-2 w-px bg-zinc-700" aria-hidden /> : null}
      {!labelAbove ? labelBlock : null}
    </span>
  );

  const className = `absolute z-30 -translate-x-1/2 ${
    point.outOfRange ? "outline outline-1 outline-offset-2 outline-amber-600" : ""
  }`;

  const style = {
    left: `${left}%`,
    top: railY - 5,
  };

  if (interactive && onSelect) {
    return (
      <button
        type="button"
        data-testid="temporal-point"
        data-temporal-id={point.id}
        title={title}
        aria-label={`Key Time ${point.label}`}
        aria-pressed={selected}
        className={`${className} min-h-11 min-w-11 cursor-pointer touch-manipulation`}
        style={style}
        onClick={() => onSelect(point.id)}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      data-testid="temporal-point"
      data-temporal-id={point.id}
      title={title}
      className={className}
      style={style}
      role="img"
      aria-label={`Key Time ${point.label}`}
    >
      {body}
    </div>
  );
}

/** Ordered sequence fallback — required for a11y and narrow surfaces. */
export function TemporalListFallback({
  model,
  className = "",
}: {
  model: TemporalStripModel;
  className?: string;
}) {
  const items = listItems(model).map((item) => {
    const span = model.spans.find((s) => s.id === item.id);
    if (span) {
      return {
        id: span.id,
        text: `${span.label}${span.detail ? ` — ${span.detail}` : ""}`,
      };
    }
    const point = model.points.find((p) => p.id === item.id);
    if (point) {
      const subs = point.sublabels?.length ? ` (${point.sublabels.join("; ")})` : "";
      return {
        id: point.id,
        text: `${point.label}${subs}${point.detail ? ` — ${point.detail}` : ""}`,
      };
    }
    return item;
  });

  if (items.length === 0) return null;

  return (
    <ol
      className={`list-decimal space-y-1 pl-5 text-xs text-zinc-600 ${className}`.trim()}
      data-testid="temporal-list-fallback"
    >
      {items.map((item) => (
        <li key={item.id}>{item.text}</li>
      ))}
    </ol>
  );
}
