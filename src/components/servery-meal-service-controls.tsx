"use client";

import type { MealType } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  correctServeryServiceTimeAction,
  recordServeryServiceTimeAction,
} from "@/app/(protected)/unit/[unitId]/actions";
import { formatServeryLiveStamp } from "@/lib/servery-meal-service";

type ServerySlot = {
  mealType: MealType;
  scheduledTime: string;
};

type MilestoneState = {
  /** When the milestone occurred, ISO. Null means Not Confirmed. */
  occurredAt: string | null;
  /** When the server accepted the record, ISO. Null for records predating this column. */
  recordedAt: string | null;
  /** Display name of whoever recorded it, already resolved server-side. */
  recordedByLabel: string | null;
  /** True when the current value came from a correction rather than the original entry. */
  corrected: boolean;
};

type EventPayload = {
  ready: MilestoneState;
  started: MilestoneState;
};

const MEAL_ORDER: MealType[] = ["BREAKFAST", "LUNCH", "DINNER"];

const EMPTY_MILESTONE: MilestoneState = {
  occurredAt: null,
  recordedAt: null,
  recordedByLabel: null,
  corrected: false,
};

function fmtMealLabel(meal: MealType) {
  return meal.charAt(0) + meal.slice(1).toLowerCase();
}

function fmtClock(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Idempotency key for one press.
 *
 * Deterministic so the server and the client agree during hydration, and so a double tap on the
 * same rendered button carries the same key and produces one effect. It changes once the milestone
 * has a value, so a later genuine press is a distinct command rather than a silent replay.
 */
function clientActionIdFor(
  unitId: string,
  meal: MealType,
  milestone: "READY" | "STARTED",
  state: MilestoneState,
) {
  return `${unitId}:${meal}:${milestone}:${state.occurredAt ?? "none"}`;
}

function MilestoneSubmitButton({
  label,
  stamp,
  disabled,
}: {
  label: string;
  stamp: string;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      // Blocking the second tap is a convenience, not the safeguard: the server deduplicates on the
      // action id, so a press that gets through twice still produces one record.
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      className="flex min-h-12 w-full flex-col justify-center rounded-lg border-2 border-zinc-900 bg-zinc-900 px-4 py-3 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:border-zinc-400 disabled:bg-zinc-400 touch-manipulation"
    >
      <span>{pending ? "Recording…" : label}</span>
      <span className="text-xs font-medium text-zinc-200">{stamp}</span>
    </button>
  );
}

/** `datetime-local` value for an instant, in the browser's zone — which is the facility's zone on a tablet at the servery. */
function toLocalInputValue(iso: string): string {
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function CorrectionForm({
  unitId,
  meal,
  milestone,
  label,
  state,
  returnTab,
}: {
  unitId: string;
  meal: MealType;
  milestone: "READY" | "STARTED";
  label: string;
  state: MilestoneState;
  returnTab: "overview" | "logs";
}) {
  const [localValue, setLocalValue] = useState(() =>
    state.occurredAt ? toLocalInputValue(state.occurredAt) : "",
  );

  if (!state.occurredAt) return null;

  return (
    <details className="mt-2 rounded-lg border border-zinc-200 bg-white p-2">
      <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
        Correct {label}
      </summary>
      <form action={correctServeryServiceTimeAction} className="mt-2 space-y-2">
        <input type="hidden" name="unitId" value={unitId} />
        <input type="hidden" name="mealType" value={meal} />
        <input type="hidden" name="eventType" value={milestone} />
        <input type="hidden" name="returnTab" value={returnTab} />
        {/* Keyed to the value being replaced, so re-submitting the same correction is a replay
            rather than a second correction entry. */}
        <input
          type="hidden"
          name="clientActionId"
          value={`${unitId}:${meal}:${milestone}:correct:${state.occurredAt}`}
        />
        <input type="hidden" name="occurredAt" value={localValue ? new Date(localValue).toISOString() : ""} />
        <label className="block text-xs font-medium text-zinc-700">
          Actual time
          <input
            type="datetime-local"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            required
            className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-zinc-700">
          Reason
          <input
            type="text"
            name="reason"
            required
            minLength={3}
            maxLength={500}
            placeholder="Why the recorded time is being changed"
            className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 w-full rounded-md border-2 border-zinc-900 bg-white px-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 touch-manipulation"
        >
          Save correction
        </button>
        <p className="text-xs text-zinc-500">
          The original entry is kept. Corrections are recorded with your name and reason.
        </p>
      </form>
    </details>
  );
}

function MilestoneStatus({ label, state }: { label: string; state: MilestoneState }) {
  if (!state.occurredAt) {
    return (
      <p className="text-xs text-zinc-500">
        <span className="font-semibold text-zinc-700">{label}:</span> Not Confirmed
      </p>
    );
  }
  const occurred = fmtClock(state.occurredAt);
  const recorded = fmtClock(state.recordedAt);
  const lateEntry = recorded && recorded !== occurred;
  return (
    <p className="text-xs text-zinc-500">
      <span className="font-semibold text-zinc-700">{label}:</span> {occurred}
      {state.corrected ? " (corrected)" : ""}
      {state.recordedByLabel ? ` · ${state.recordedByLabel}` : ""}
      {lateEntry ? ` · recorded ${recorded}` : ""}
    </p>
  );
}

type ServeryMealServiceControlsProps = {
  unitId: string;
  /** Absent when no meal applies right now; the component then explains why instead of guessing. */
  defaultMealType: MealType | null;
  returnTab: "overview" | "logs";
  returnLogTab: string;
  slots: ServerySlot[];
  eventByMeal: Partial<Record<MealType, EventPayload>>;
  /** Explains the current state when no milestone action applies. */
  contextNote: string;
  /** False when the viewer's role and unit context cannot record here. */
  canRecord: boolean;
  /** True when the viewer may correct an already-recorded time. */
  canCorrect: boolean;
  offline?: {
    enabled: boolean;
    isOfflineMode: boolean;
    pendingCount: number;
    onOfflineRecord: (input: {
      mealType: MealType;
      commandType: "RECORD_SERVERY_READY" | "RECORD_MEAL_SERVICE_STARTED";
    }) => Promise<void>;
  };
};

export function ServeryMealServiceControls({
  unitId,
  defaultMealType,
  returnTab,
  returnLogTab,
  slots,
  eventByMeal,
  contextNote,
  canRecord,
  canCorrect,
  offline,
}: ServeryMealServiceControlsProps) {
  const orderedSlots = useMemo(
    () => MEAL_ORDER.flatMap((m) => slots.find((s) => s.mealType === m) ?? []),
    [slots],
  );

  // Null until a slot exists. An empty slot list yields no selection rather than an out-of-range
  // read, which is what previously threw during server rendering and returned 500 for the page.
  const [selectedMeal, setSelectedMeal] = useState<MealType | null>(() => {
    if (defaultMealType && slots.some((s) => s.mealType === defaultMealType)) {
      return defaultMealType;
    }
    return slots[0]?.mealType ?? null;
  });
  const [now, setNow] = useState(() => new Date());

  const selectedSlot = useMemo(
    () => orderedSlots.find((s) => s.mealType === selectedMeal) ?? orderedSlots[0] ?? null,
    [orderedSlots, selectedMeal],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [localPending, setLocalPending] = useState<{ ready?: boolean; started?: boolean }>({});

  if (orderedSlots.length === 0 || !selectedSlot) {
    return (
      <div
        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 md:max-w-md md:ms-auto lg:max-w-sm"
        data-testid="servery-meal-service-unavailable"
        role="status"
      >
        <p className="font-semibold text-zinc-900">Meal service milestones unavailable</p>
        <p className="mt-1">{contextNote}</p>
      </div>
    );
  }

  const activeMeal = selectedSlot.mealType;
  const event = eventByMeal[activeMeal];
  const ready = event?.ready ?? EMPTY_MILESTONE;
  const started = event?.started ?? EMPTY_MILESTONE;
  const readyAt = ready.occurredAt ? new Date(ready.occurredAt) : null;
  const startedAt = started.occurredAt ? new Date(started.occurredAt) : null;

  const useOfflineFlow = offline?.enabled && offline.isOfflineMode;

  async function handleOfflineReady() {
    if (!offline || !useOfflineFlow) return;
    setLocalPending((p) => ({ ...p, ready: true }));
    try {
      await offline.onOfflineRecord({ mealType: activeMeal, commandType: "RECORD_SERVERY_READY" });
    } catch {
      setLocalPending((p) => ({ ...p, ready: false }));
    }
  }

  async function handleOfflineStarted() {
    if (!offline || !useOfflineFlow) return;
    setLocalPending((p) => ({ ...p, started: true }));
    try {
      await offline.onOfflineRecord({
        mealType: activeMeal,
        commandType: "RECORD_MEAL_SERVICE_STARTED",
      });
    } catch {
      setLocalPending((p) => ({ ...p, started: false }));
    }
  }

  return (
    <div
      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:max-w-md md:ms-auto lg:max-w-sm"
      data-testid="servery-meal-service-controls"
    >
      <div className="mb-2 flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Meal period</p>
        <div
          className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-200 bg-zinc-100/90 p-1"
          role="group"
          aria-label="Choose meal period"
        >
          {orderedSlots.map((slot) => {
            const isActive = activeMeal === slot.mealType;
            return (
              <button
                key={slot.mealType}
                type="button"
                onClick={() => setSelectedMeal(slot.mealType)}
                aria-pressed={isActive}
                className={`min-h-11 rounded-md px-2 py-2 text-sm font-semibold transition touch-manipulation ${
                  isActive ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-800 hover:bg-white/80"
                }`}
              >
                {fmtMealLabel(slot.mealType)}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500">Line {selectedSlot.scheduledTime}</p>
        <p className="text-xs text-zinc-500">{contextNote}</p>
      </div>

      {canRecord ? (
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
          {useOfflineFlow ? (
            <>
              <button
                type="button"
                onClick={() => void handleOfflineReady()}
                disabled={ready.occurredAt != null || localPending.ready}
                className="flex min-h-12 w-full flex-col justify-center rounded-lg border-2 border-zinc-900 bg-zinc-900 px-4 py-3 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:border-zinc-400 disabled:bg-zinc-400 touch-manipulation"
              >
                <span>{localPending.ready ? "Saved on this tablet" : "Servery Ready"}</span>
                <span className="text-xs font-medium text-zinc-200">
                  {formatServeryLiveStamp(readyAt, now)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleOfflineStarted()}
                disabled={started.occurredAt != null || localPending.started}
                className="flex min-h-12 w-full flex-col justify-center rounded-lg border-2 border-zinc-900 bg-zinc-900 px-4 py-3 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:border-zinc-400 disabled:bg-zinc-400 touch-manipulation"
              >
                <span>{localPending.started ? "Saved on this tablet" : "Meal Service Started"}</span>
                <span className="text-xs font-medium text-zinc-200">
                  {formatServeryLiveStamp(startedAt, now)}
                </span>
              </button>
            </>
          ) : (
            <>
              <form action={recordServeryServiceTimeAction}>
                <input type="hidden" name="unitId" value={unitId} />
                <input type="hidden" name="mealType" value={activeMeal} />
                <input type="hidden" name="eventType" value="READY" />
                <input
                  type="hidden"
                  name="clientActionId"
                  value={clientActionIdFor(unitId, activeMeal, "READY", ready)}
                />
                <input type="hidden" name="returnTab" value={returnTab} />
                <input type="hidden" name="returnLogTab" value={returnLogTab} />
                <MilestoneSubmitButton
                  label="Servery Ready"
                  stamp={formatServeryLiveStamp(readyAt, now)}
                  disabled={ready.occurredAt != null}
                />
              </form>
              <form action={recordServeryServiceTimeAction}>
                <input type="hidden" name="unitId" value={unitId} />
                <input type="hidden" name="mealType" value={activeMeal} />
                <input type="hidden" name="eventType" value="STARTED" />
                <input
                  type="hidden"
                  name="clientActionId"
                  value={clientActionIdFor(unitId, activeMeal, "STARTED", started)}
                />
                <input type="hidden" name="returnTab" value={returnTab} />
                <input type="hidden" name="returnLogTab" value={returnLogTab} />
                <MilestoneSubmitButton
                  label="Meal Service Started"
                  stamp={formatServeryLiveStamp(startedAt, now)}
                  disabled={started.occurredAt != null}
                />
              </form>
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-zinc-500" data-testid="servery-milestone-readonly">
          Recording meal service milestones is not available for your role in this servery.
        </p>
      )}

      <div className="mt-3 space-y-1 border-t border-zinc-200 pt-2">
        <MilestoneStatus label="Servery Ready" state={ready} />
        {localPending.ready ? (
          <p className="text-xs font-semibold text-amber-700">Saved on this tablet · waiting to synchronize</p>
        ) : null}
        <MilestoneStatus label="Meal Service Started" state={started} />
        {localPending.started ? (
          <p className="text-xs font-semibold text-amber-700">Saved on this tablet · waiting to synchronize</p>
        ) : null}
        {canCorrect ? (
          <div data-testid="servery-milestone-corrections">
            <CorrectionForm
              unitId={unitId}
              meal={activeMeal}
              milestone="READY"
              label="Servery Ready"
              state={ready}
              returnTab={returnTab}
            />
            <CorrectionForm
              unitId={unitId}
              meal={activeMeal}
              milestone="STARTED"
              label="Meal Service Started"
              state={started}
              returnTab={returnTab}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
