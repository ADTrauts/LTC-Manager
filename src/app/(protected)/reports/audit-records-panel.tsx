import type { AuditRecordSlot } from "@/lib/audit/audit-records";

import { createRecordWaiverAction } from "./waiver-action";
import { ReviewCard, ReviewCell, ReviewStatus, ReviewTable, ReviewTableRow } from "./review-layout";

function statusKind(state: AuditRecordSlot["slotState"]) {
  if (state === "NOT_COMPLETE") return "alert" as const;
  if (state === "WAIVED" || state === "COMPLETE_WITH_CORRECTIVE_ACTION" || state === "OVERDUE") {
    return "progress" as const;
  }
  if (state === "COMPLETE") return "ok" as const;
  return "neutral" as const;
}

export function AuditRecordsPanel({
  slots,
  departmentId,
}: {
  slots: readonly AuditRecordSlot[];
  departmentId: string;
}) {
  const waiveable = slots.filter((slot) => slot.slotState === "NOT_COMPLETE" && slot.waiverAllowed);
  return (
    <ReviewCard
      title="Record audit"
      subtitle="Expected slots for the selected definition, using the configuration effective each service date."
      testId="record-audit"
    >
      {slots.length === 0 ? (
        <p className="text-sm text-zinc-600">No expected Record slots for this range.</p>
      ) : (
        <ReviewTable
          caption="Record audit"
          columns={["Date", "Location", "Window", "Status", "Value", "Recorded", "Follow-up"]}
        >
          {slots.map((slot) => (
            <ReviewTableRow key={slot.requirementKey}>
              <ReviewCell>{slot.serviceDate}</ReviewCell>
              <ReviewCell>
                {slot.placeLabel ?? "—"}
                {slot.placeLabelCertainty === "CURRENT_LABEL" ? (
                  <span className="mt-1 block text-xs text-zinc-500">Current label. Earlier name was not tracked.</span>
                ) : null}
              </ReviewCell>
              <ReviewCell>{slot.windowStartLocal ?? slot.cycleStableKey ?? "—"}</ReviewCell>
              <ReviewCell>
                <ReviewStatus kind={statusKind(slot.slotState)}>{slot.slotState.replaceAll("_", " ")}</ReviewStatus>
              </ReviewCell>
              <ReviewCell>
                {slot.record?.valueNumber ?? slot.record?.valueText ?? "—"}
                {slot.record?.outOfStandard ? <span className="mt-1 block text-xs">Out of range</span> : null}
                {slot.record?.correctiveActionText ? (
                  <span className="mt-1 block text-xs">{slot.record.correctiveActionText}</span>
                ) : null}
                {slot.corrections[0] ? (
                  <span className="mt-1 block text-xs">
                    Corrected from {slot.corrections[0].previousValue}. {slot.corrections[0].reason}
                  </span>
                ) : null}
                {slot.waiver ? <span className="mt-1 block text-xs">{slot.waiver.reason}</span> : null}
              </ReviewCell>
              <ReviewCell>
                {slot.record?.recordedByLabel ?? slot.waiver?.actorLabel ?? "—"}
                {slot.record?.recordedAt ? <span className="mt-1 block text-xs">{slot.record.recordedAt}</span> : null}
              </ReviewCell>
              <ReviewCell>
                {slot.followUps.map((row) => row.valueNumber ?? "Recorded").join(", ") || "—"}
              </ReviewCell>
            </ReviewTableRow>
          ))}
        </ReviewTable>
      )}
      {waiveable.length > 0 ? (
        <form action={createRecordWaiverAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="departmentId" value={departmentId} />
          <label className="space-y-1 text-sm">
            <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Waive slot
            </span>
            <select className="app-input min-w-64" name="slot">
              {waiveable.map((slot) => (
                <option
                  key={slot.requirementKey}
                  value={JSON.stringify({
                    logAttachmentId: slot.requirementSegmentId,
                    operationalDateKey: slot.serviceDate,
                    requirementKey: slot.requirementKey,
                  })}
                >
                  {slot.serviceDate} {slot.placeLabel ?? slot.locationFunctionKey} {slot.windowStartLocal ?? ""}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Reason</span>
            <input className="app-input" name="reason" required />
          </label>
          <button type="submit" className="app-button bg-zinc-900 text-white hover:bg-zinc-700">
            Record waiver
          </button>
        </form>
      ) : null}
    </ReviewCard>
  );
}
