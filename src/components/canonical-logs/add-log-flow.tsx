"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { CatalogBrowseCard } from "@/lib/canonical-logs/catalog-browse";
import type { CycleOptionForLogs } from "@/lib/canonical-logs/cycle-options";
import type { ResolvedAttachTiming } from "@/lib/canonical-logs/attach-timing";
import { formatLocalTime12h } from "@/lib/canonical-logs/timing-display";

import { createCanonicalLogAttachmentAction } from "@/app/(protected)/build/logs/actions";

type WindowDraft = { label: string; startLocal: string; endLocal: string };

type Props = {
  facilityId: string;
  departmentId: string;
  departmentName: string;
  targetKind: "ASSET" | "SPACE" | "UNIT" | "DEPARTMENT";
  targetId: string;
  targetTitle: string;
  targetSubtitle?: string | null;
  catalogCards: CatalogBrowseCard[];
  suggestedStableKeys: string[];
  /** Preselect when deep-linked from Catalog. */
  initialCatalogStableKey?: string | null;
  cycleOptions: CycleOptionForLogs[];
  defaultTimingByStableKey: Record<string, ResolvedAttachTiming>;
  effectiveFromKey: string;
  effectiveLabel: string;
  cancelHref: string;
};

type Step = "choose" | "confirm" | "customize";

export function AddLogFlowClient(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>(props.initialCatalogStableKey ? "confirm" : "choose");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(
    props.initialCatalogStableKey ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [localLabel, setLocalLabel] = useState("");
  const [localInstructions, setLocalInstructions] = useState("");
  const [windows, setWindows] = useState<WindowDraft[]>([]);
  const [cycleKeys, setCycleKeys] = useState<string[]>([]);
  const [customized, setCustomized] = useState(false);

  const suggested = useMemo(() => new Set(props.suggestedStableKeys), [props.suggestedStableKeys]);

  const selectedCard = props.catalogCards.find((c) => c.stableKey === selectedKey) ?? null;
  const baseTiming = selectedKey ? props.defaultTimingByStableKey[selectedKey] : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = props.catalogCards.filter((c) => {
      if (!q) return true;
      return `${c.name} ${c.description} ${c.categoryLabel}`.toLowerCase().includes(q);
    });
    return [...rows].sort((a, b) => {
      const as = suggested.has(a.stableKey) ? 0 : 1;
      const bs = suggested.has(b.stableKey) ? 0 : 1;
      if (as !== bs) return as - bs;
      return a.name.localeCompare(b.name);
    });
  }, [props.catalogCards, search, suggested]);

  function selectCatalog(stableKey: string) {
    setSelectedKey(stableKey);
    setError(null);
    setCustomized(false);
    const timing = props.defaultTimingByStableKey[stableKey];
    setWindows(timing?.dailyWindows ?? []);
    setCycleKeys(timing?.cycleStableKeys ?? []);
    setStep("confirm");
  }

  function openCustomize() {
    if (!baseTiming) return;
    setWindows(baseTiming.dailyWindows);
    setCycleKeys(baseTiming.cycleStableKeys);
    setCustomized(true);
    setStep("customize");
  }

  function submit(options?: { customized?: boolean; windows?: WindowDraft[]; cycleKeys?: string[] }) {
    if (!selectedCard || !baseTiming) return;
    setError(null);
    const isCustom = options?.customized ?? customized;
    const timingWindows = options?.windows ?? windows;
    const timingCycles = options?.cycleKeys ?? cycleKeys;
    const timing = isCustom
      ? {
          ...baseTiming,
          dailyWindows: timingWindows,
          cycleStableKeys: timingCycles,
          usingRecommendedSchedule: false,
        }
      : baseTiming;

    startTransition(async () => {
      const result = await createCanonicalLogAttachmentAction({
        catalogStableKey: selectedCard.stableKey,
        departmentId: props.departmentId,
        targetKind: props.targetKind,
        targetId: props.targetId,
        timingMode: timing.timingMode,
        dailyWindows: timing.dailyWindows,
        cycleStableKeys: timing.cycleStableKeys,
        calendarCadence: timing.calendarCadence,
        calendarDaysOfWeek: timing.calendarDaysOfWeek,
        calendarDayOfMonth: timing.calendarDayOfMonth,
        calendarDueTimeLocal: timing.calendarDueTimeLocal,
        allowAdHoc: timing.allowAdHoc,
        localDisplayLabel: localLabel.trim() || null,
        localInstructions: localInstructions.trim() || null,
        effectiveFromKey: props.effectiveFromKey,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(result.redirectTo);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4" data-testid="add-log-flow">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Add a Log</h1>
          <p className="text-xs text-zinc-500">
            To: {props.targetTitle}
            {props.targetSubtitle ? ` · ${props.targetSubtitle}` : ""}
          </p>
        </div>
        <Link
          href={props.cancelHref}
          className="text-xs font-medium text-zinc-600 underline underline-offset-2"
        >
          Cancel
        </Link>
      </div>

      {error ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
          role="alert"
          data-testid="add-log-error"
        >
          {error}
        </div>
      ) : null}

      {step === "choose" ? (
        <div className="space-y-3" data-testid="add-log-chooser">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Search Catalog
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
            />
          </label>
          <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
            {filtered.map((card) => (
              <li key={card.id} className="flex items-start justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900">{card.name}</p>
                  <p className="text-xs text-zinc-600">{card.description}</p>
                  <p className="mt-1 text-xs text-zinc-700">
                    Recommended: {card.recommendedCadenceLabel}
                  </p>
                  {suggested.has(card.stableKey) ? (
                    <p className="mt-1 text-xs font-medium text-zinc-800">
                      Suggested for this {props.targetKind === "ASSET" ? "asset" : "target"}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => selectCatalog(card.stableKey)}
                  className="inline-flex min-h-9 shrink-0 items-center rounded-md border border-zinc-900 bg-zinc-900 px-2.5 text-xs font-medium text-white"
                  data-testid="choose-catalog-log"
                >
                  Select
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === "confirm" && selectedCard && baseTiming ? (
        <div
          className="space-y-3 rounded-md border border-zinc-200 bg-white px-3 py-3"
          data-testid="add-log-confirm"
        >
          <h2 className="text-base font-semibold text-zinc-900">Add {selectedCard.name}</h2>
          <dl className="space-y-1 text-sm text-zinc-700">
            <div>
              <dt className="text-xs text-zinc-500">To</dt>
              <dd>
                {props.targetTitle}
                {props.targetSubtitle ? ` · ${props.targetSubtitle}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Schedule</dt>
              <dd>
                {baseTiming.recommendedCadenceLabel}
                {baseTiming.timingSummary ? (
                  <span className="block text-xs text-zinc-600">{baseTiming.timingSummary}</span>
                ) : null}
              </dd>
            </div>
            {baseTiming.timingMode === "DAILY_WINDOWS" ? (
              <div>
                <dt className="sr-only">Windows</dt>
                <dd className="text-xs text-zinc-600">
                  {baseTiming.dailyWindows.map((w) => w.label).join(" · ")}
                </dd>
              </div>
            ) : null}
            {baseTiming.timingMode === "OPERATIONAL_CYCLE" ? (
              <div>
                <dt className="text-xs text-zinc-500">Operational Cycles</dt>
                <dd className="text-xs text-zinc-700">
                  {baseTiming.cycleStableKeys
                    .map((k) => props.cycleOptions.find((c) => c.stableKey === k)?.label ?? k)
                    .join(" · ") || "None selected yet"}
                </dd>
              </div>
            ) : null}
            {baseTiming.timingMode === "AD_HOC" ? (
              <p className="text-xs text-zinc-600">
                This Log does not create scheduled requirements. Staff can start it when needed.
              </p>
            ) : null}
            <div>
              <dt className="text-xs text-zinc-500">Department</dt>
              <dd>{props.departmentName}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Effective</dt>
              <dd>{props.effectiveLabel}</dd>
            </div>
          </dl>
          {baseTiming.usingRecommendedSchedule ? (
            <p className="text-xs font-medium text-zinc-700" data-testid="using-recommended">
              Using recommended schedule
            </p>
          ) : null}
          {baseTiming.needsSetup ? (
            <p className="text-xs text-amber-900" data-testid="confirm-needs-setup">
              Schedule needs attention — {baseTiming.needsSetupReason}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={pending}
              onClick={() => submit()}
              className="inline-flex min-h-10 items-center rounded-md border border-zinc-900 bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-60"
              data-testid="confirm-add-log"
            >
              {pending ? "Adding…" : "Add log"}
            </button>
            <button
              type="button"
              onClick={openCustomize}
              className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800"
              data-testid="customize-schedule"
            >
              Customize
            </button>
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="inline-flex min-h-10 items-center px-2 text-sm text-zinc-600 underline underline-offset-2"
            >
              Back
            </button>
          </div>
        </div>
      ) : null}

      {step === "customize" && selectedCard && baseTiming ? (
        <div className="space-y-4 rounded-md border border-zinc-200 bg-white px-3 py-3" data-testid="add-log-customize">
          <h2 className="text-base font-semibold text-zinc-900">Customize schedule</h2>
          <p className="text-xs text-zinc-500">Local timing only — Catalog fields stay read-only.</p>

          {(baseTiming.timingMode === "DAILY_WINDOWS" || windows.length > 0) &&
          baseTiming.timingMode !== "OPERATIONAL_CYCLE" &&
          baseTiming.timingMode !== "AD_HOC" ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-800">Daily windows</p>
              {windows.map((w, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-4">
                  <input
                    aria-label={`Window ${index + 1} label`}
                    value={w.label}
                    onChange={(e) => {
                      const next = [...windows];
                      next[index] = { ...w, label: e.target.value };
                      setWindows(next);
                    }}
                    className="min-h-9 rounded-md border border-zinc-300 px-2 text-sm"
                    placeholder="Label"
                  />
                  <input
                    type="time"
                    aria-label={`Window ${index + 1} start`}
                    value={w.startLocal}
                    onChange={(e) => {
                      const next = [...windows];
                      next[index] = { ...w, startLocal: e.target.value };
                      setWindows(next);
                    }}
                    className="min-h-9 rounded-md border border-zinc-300 px-2 text-sm"
                  />
                  <input
                    type="time"
                    aria-label={`Window ${index + 1} end`}
                    value={w.endLocal}
                    onChange={(e) => {
                      const next = [...windows];
                      next[index] = { ...w, endLocal: e.target.value };
                      setWindows(next);
                    }}
                    className="min-h-9 rounded-md border border-zinc-300 px-2 text-sm"
                  />
                  <button
                    type="button"
                    className="min-h-9 text-xs text-zinc-600 underline"
                    onClick={() => setWindows(windows.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                  <p className="sm:col-span-4 text-[11px] text-zinc-500">
                    {formatLocalTime12h(w.startLocal)} – {formatLocalTime12h(w.endLocal)}
                  </p>
                </div>
              ))}
              <button
                type="button"
                className="text-xs font-medium text-zinc-800 underline"
                onClick={() =>
                  setWindows([...windows, { label: "Window", startLocal: "09:00", endLocal: "11:00" }])
                }
              >
                Add window
              </button>
              <button
                type="button"
                className="ml-3 text-xs font-medium text-zinc-800 underline"
                onClick={() => {
                  setWindows(baseTiming.dailyWindows);
                  setCustomized(false);
                }}
              >
                Reset to recommended
              </button>
            </div>
          ) : null}

          {baseTiming.timingMode === "OPERATIONAL_CYCLE" ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-zinc-800">
                When should this Log be completed?
              </legend>
              <p className="text-xs text-zinc-500">Use Operational Cycles</p>
              {props.cycleOptions.length === 0 ? (
                <p className="text-xs text-amber-900">
                  No published Operational Cycles for this Department.
                </p>
              ) : (
                props.cycleOptions.map((cycle) => (
                  <label key={cycle.stableKey} className="flex min-h-9 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={cycleKeys.includes(cycle.stableKey)}
                      onChange={(e) => {
                        setCycleKeys((prev) =>
                          e.target.checked
                            ? [...prev, cycle.stableKey]
                            : prev.filter((k) => k !== cycle.stableKey),
                        );
                      }}
                    />
                    {cycle.label}
                  </label>
                ))
              )}
            </fieldset>
          ) : null}

          {baseTiming.timingMode === "AD_HOC" ? (
            <p className="text-sm text-zinc-700">
              As needed — this Log does not create scheduled requirements.
            </p>
          ) : null}

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Local label (optional)
            <input
              value={localLabel}
              onChange={(e) => setLocalLabel(e.target.value)}
              placeholder={selectedCard.name}
              className="min-h-9 rounded-md border border-zinc-300 px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Local instructions (optional)
            <textarea
              value={localInstructions}
              onChange={(e) => setLocalInstructions(e.target.value)}
              rows={2}
              placeholder="Facility note — does not replace Catalog instructions"
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setCustomized(true);
                submit({ customized: true, windows, cycleKeys });
              }}
              className="inline-flex min-h-10 items-center rounded-md border border-zinc-900 bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Adding…" : "Add log"}
            </button>
            <button
              type="button"
              onClick={() => setStep("confirm")}
              className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-3 text-sm"
            >
              Back
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
