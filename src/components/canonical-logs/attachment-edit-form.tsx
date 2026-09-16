"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { LogAttachmentStatus, LogAttachmentTimingMode } from "@prisma/client";

import type { CycleOptionForLogs } from "@/lib/canonical-logs/cycle-options";
import {
  setCanonicalLogAttachmentStatusAction,
  updateCanonicalLogAttachmentAction,
} from "@/app/(protected)/build/logs/actions";

type WindowDraft = { label: string; startLocal: string; endLocal: string };

type Props = {
  attachmentId: string;
  catalogName: string;
  catalogVersion: number;
  timingMode: LogAttachmentTimingMode;
  dailyWindows: WindowDraft[];
  cycleStableKeys: string[];
  cycleOptions: CycleOptionForLogs[];
  localDisplayLabel: string | null;
  localInstructions: string | null;
  status: LogAttachmentStatus;
  needsSetup: boolean;
  needsSetupReason: string | null;
  backHref: string;
  allowAdHoc: boolean;
};

export function AttachmentEditForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [windows, setWindows] = useState(props.dailyWindows);
  const [cycleKeys, setCycleKeys] = useState(props.cycleStableKeys);
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
        calendarCadence: null,
        calendarDaysOfWeek: [],
        calendarDayOfMonth: null,
        calendarDueTimeLocal: null,
        allowAdHoc: props.allowAdHoc,
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

  return (
    <div className="space-y-4" data-testid="attachment-edit-form">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">{props.catalogName}</h1>
          <p className="text-xs text-zinc-500">Catalog version {props.catalogVersion}</p>
        </div>
        <Link href={props.backHref} className="text-xs font-medium underline underline-offset-2">
          Back
        </Link>
      </div>

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
          <legend className="text-sm font-medium">When should this Log be completed?</legend>
          <p className="text-xs text-zinc-500">Use Operational Cycles</p>
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

      {props.timingMode === "AD_HOC" ? (
        <p className="text-sm text-zinc-700">
          As needed — this Log does not create scheduled requirements.
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

      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as LogAttachmentStatus)}
          className="min-h-9 rounded-md border border-zinc-300 px-2 text-sm"
        >
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="RETIRED">Retired</option>
        </select>
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
        {status === "ACTIVE" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatusQuick("INACTIVE")}
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-3 text-sm"
          >
            Deactivate
          </button>
        ) : null}
        {status !== "RETIRED" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatusQuick("RETIRED")}
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-3 text-sm"
          >
            Retire
          </button>
        ) : null}
      </div>
    </div>
  );
}
