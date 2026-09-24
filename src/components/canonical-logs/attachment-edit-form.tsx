"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  LogAttachmentCalendarCadence,
  LogAttachmentStatus,
  LogAttachmentTimingMode,
} from "@prisma/client";

import type { CycleOptionForLogs } from "@/lib/canonical-logs/cycle-options";
import {
  adoptCanonicalLogAttachmentAction,
  setCanonicalLogAttachmentStatusAction,
  updateCanonicalLogAttachmentAction,
} from "@/app/(protected)/build/logs/actions";

type WindowDraft = { label: string; startLocal: string; endLocal: string };

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

type Props = {
  attachmentId: string;
  catalogName: string;
  catalogVersion: number;
  timingMode: LogAttachmentTimingMode;
  dailyWindows: WindowDraft[];
  cycleStableKeys: string[];
  cycleOptions: CycleOptionForLogs[];
  calendarCadence: LogAttachmentCalendarCadence | null;
  calendarDaysOfWeek: number[];
  calendarDayOfMonth: number | null;
  calendarDueTimeLocal: string | null;
  localDisplayLabel: string | null;
  localInstructions: string | null;
  status: LogAttachmentStatus;
  needsSetup: boolean;
  needsSetupReason: string | null;
  backHref: string;
  backLabel?: string;
  targetTitle?: string | null;
  allowAdHoc: boolean;
  hasBecomeEffective: boolean;
  updateAvailable: boolean;
  latestCatalogVersion: number | null;
};

function timingLabel(mode: LogAttachmentTimingMode): string {
  switch (mode) {
    case "OPERATIONAL_CYCLE":
      return "During Operational Cycles";
    case "DAILY_WINDOWS":
      return "Daily";
    case "CALENDAR":
      return "Weekly / Monthly";
    case "AD_HOC":
      return "Manual";
  }
}

export function AttachmentEditForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [windows, setWindows] = useState(props.dailyWindows);
  const [cycleKeys, setCycleKeys] = useState(props.cycleStableKeys);
  const [calendarCadence, setCalendarCadence] = useState<LogAttachmentCalendarCadence>(
    props.calendarCadence ?? "WEEKLY",
  );
  const [daysOfWeek, setDaysOfWeek] = useState(props.calendarDaysOfWeek);
  const [dayOfMonth, setDayOfMonth] = useState(props.calendarDayOfMonth ?? 1);
  const [dueTime, setDueTime] = useState(props.calendarDueTimeLocal ?? "");
  const [localLabel, setLocalLabel] = useState(props.localDisplayLabel ?? "");
  const [localInstructions, setLocalInstructions] = useState(props.localInstructions ?? "");
  const [status, setStatus] = useState(props.status);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateCanonicalLogAttachmentAction({
        attachmentId: props.attachmentId,
        timingMode: props.timingMode,
        dailyWindows: windows,
        cycleStableKeys: cycleKeys,
        calendarCadence: props.timingMode === "CALENDAR" ? calendarCadence : null,
        calendarDaysOfWeek: props.timingMode === "CALENDAR" ? daysOfWeek : [],
        calendarDayOfMonth: props.timingMode === "CALENDAR" && calendarCadence === "MONTHLY" ? dayOfMonth : null,
        calendarDueTimeLocal: props.timingMode === "CALENDAR" && dueTime.trim() ? dueTime : null,
        allowAdHoc: props.timingMode === "AD_HOC",
        localDisplayLabel: localLabel.trim() || null,
        localInstructions: localInstructions.trim() || null,
        status,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(result.redirectTo);
      router.refresh();
    });
  }

  function setStatusQuick(next: LogAttachmentStatus) {
    setError(null);
    startTransition(async () => {
      const result = await setCanonicalLogAttachmentStatusAction({
        attachmentId: props.attachmentId,
        status: next,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatus(next);
      router.refresh();
    });
  }

  function adopt() {
    setError(null);
    startTransition(async () => {
      const result = await adoptCanonicalLogAttachmentAction({
        attachmentId: props.attachmentId,
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
    <div className="space-y-4" data-testid="attachment-edit-form">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">{props.catalogName}</h1>
          <p className="text-xs text-zinc-500">
            {props.targetTitle ? `${props.targetTitle} · ` : ""}
            Version {props.catalogVersion} · LTC Corp maintained
          </p>
        </div>
        <Link href={props.backHref} className="text-xs font-medium underline underline-offset-2">
          {props.backLabel ?? "Back"}
        </Link>
      </div>

      {props.hasBecomeEffective ? (
        <p
          className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700"
          data-testid="prospective-notice"
        >
          Schedule and Catalog changes apply starting the next service day. History already recorded stays
          unchanged.
        </p>
      ) : (
        <p className="text-xs text-zinc-500">This Log has not started yet, so edits apply to this Attachment.</p>
      )}

      {props.updateAvailable ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          data-testid="update-available-banner"
        >
          <p>
            Update available
            {props.latestCatalogVersion != null ? ` · version ${props.latestCatalogVersion}` : ""}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={adopt}
            className="inline-flex min-h-9 items-center rounded-md border border-amber-900 px-2.5 text-xs font-medium"
          >
            Adopt update
          </button>
        </div>
      ) : null}

      {props.needsSetup ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          data-testid="edit-needs-setup"
        >
          <p className="font-medium">Needs setup</p>
          <p className="text-xs">{props.needsSetupReason}</p>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <p className="text-sm text-zinc-800">
        {timingLabel(props.timingMode)}
        <span className="mt-0.5 block text-xs font-normal text-zinc-500">
          Local timing only — Catalog fields stay read-only. The schedule type comes from the Catalog.
        </span>
      </p>

      {props.timingMode === "DAILY_WINDOWS" ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Daily windows</p>
          {windows.map((w, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-3">
              <input
                value={w.label}
                onChange={(e) => {
                  const next = [...windows];
                  next[index] = { ...w, label: e.target.value };
                  setWindows(next);
                }}
                className="min-h-9 rounded-md border border-zinc-300 px-2 text-sm"
                aria-label={`Window ${index + 1} label`}
              />
              <input
                type="time"
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
                value={w.endLocal}
                onChange={(e) => {
                  const next = [...windows];
                  next[index] = { ...w, endLocal: e.target.value };
                  setWindows(next);
                }}
                className="min-h-9 rounded-md border border-zinc-300 px-2 text-sm"
              />
            </div>
          ))}
          <button
            type="button"
            className="text-xs underline"
            onClick={() =>
              setWindows([...windows, { label: "Window", startLocal: "09:00", endLocal: "11:00" }])
            }
          >
            Add window
          </button>
        </div>
      ) : null}

      {props.timingMode === "OPERATIONAL_CYCLE" ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Operational Cycles</legend>
          {props.cycleOptions.map((cycle) => (
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
          ))}
        </fieldset>
      ) : null}

      {props.timingMode === "CALENDAR" ? (
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Recurrence
            <select
              value={calendarCadence}
              onChange={(e) => setCalendarCadence(e.target.value as LogAttachmentCalendarCadence)}
              className="min-h-9 rounded-md border border-zinc-300 px-2 text-sm"
            >
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="DAILY">Every day</option>
            </select>
          </label>
          {calendarCadence === "WEEKLY" ? (
            <fieldset className="flex flex-wrap gap-2">
              <legend className="w-full text-xs font-medium text-zinc-600">Weekdays</legend>
              {WEEKDAYS.map((day) => (
                <label key={day.value} className="flex min-h-9 items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={daysOfWeek.includes(day.value)}
                    onChange={(e) => {
                      setDaysOfWeek((prev) =>
                        e.target.checked
                          ? [...prev, day.value]
                          : prev.filter((d) => d !== day.value),
                      );
                    }}
                  />
                  {day.label}
                </label>
              ))}
            </fieldset>
          ) : null}
          {calendarCadence === "MONTHLY" ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              Day of month
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                className="min-h-9 w-24 rounded-md border border-zinc-300 px-2 text-sm"
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Due time (optional)
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="min-h-9 w-36 rounded-md border border-zinc-300 px-2 text-sm"
            />
          </label>
        </div>
      ) : null}

      {props.timingMode === "AD_HOC" ? (
        <p className="text-sm text-zinc-700">
          Manual — this Log has no scheduled slots. Staff start it when needed. History shows submitted
          records only.
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Local label (optional)
        <input
          value={localLabel}
          onChange={(e) => setLocalLabel(e.target.value)}
          className="min-h-9 rounded-md border border-zinc-300 px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Local instructions (optional)
        <textarea
          value={localInstructions}
          onChange={(e) => setLocalInstructions(e.target.value)}
          rows={2}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      <details className="rounded-md border border-zinc-200 px-3 py-2 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-zinc-600">
          Remove this Log from this target
        </summary>
        <p className="mt-2 text-xs text-zinc-500">
          Completed records stay in the Log Book. The Log will no longer be required here.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {status === "ACTIVE" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatusQuick("INACTIVE")}
              className="inline-flex min-h-9 items-center rounded-md border border-zinc-300 px-3 text-xs"
            >
              Pause
            </button>
          ) : null}
          {status !== "RETIRED" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatusQuick("RETIRED")}
              className="inline-flex min-h-9 items-center rounded-md border border-zinc-300 px-3 text-xs"
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatusQuick("ACTIVE")}
              className="inline-flex min-h-9 items-center rounded-md border border-zinc-300 px-3 text-xs"
            >
              Restore
            </button>
          )}
        </div>
      </details>
    </div>
  );
}
