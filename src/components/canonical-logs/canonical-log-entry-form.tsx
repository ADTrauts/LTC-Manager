"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { submitCanonicalRunLogAction } from "@/app/(protected)/staffing/logs/actions";
import { submitPartnerCanonicalLogAction } from "@/app/partner/logs/actions";
import {
  CanonicalEvidenceFieldControl,
  expectedRangeLabel,
} from "@/components/canonical-logs/canonical-evidence-field-control";
import type { EvidenceMediaInput } from "@/lib/canonical-logs/evidence-media";
import {
  dropHiddenFieldValues,
  evaluateEvidenceRules,
  formAnswersToValues,
  type CatalogEvidenceRule,
} from "@/lib/canonical-logs/evidence-rules";
import { evaluateInspectionScore } from "@/lib/canonical-logs/inspection-score";
import type { RunLogRequirementView } from "@/lib/canonical-logs/run-presentation";
import {
  evaluateCalculations,
  validateRepeatSubmission,
  type CalculationDefinition,
  type RepeatRowInput,
  type RepeatingGroupDefinition,
} from "@/lib/canonical-logs/template-structure";
import { CanonicalRepeatGroupControl } from "@/components/canonical-logs/canonical-repeat-group-control";
import type { TemplateFieldSnapshot } from "@/lib/operational-evidence/types";

type FieldDef = RunLogRequirementView["fields"][number];

type Props = {
  facilityId: string;
  departmentId: string;
  attachmentId: string;
  operationalDateKey: string;
  displayName: string;
  catalogDefinitionName: string;
  targetLabel: string;
  timingContextLabel: string;
  catalogInstructions: string | null;
  localInstructions: string | null;
  fields: FieldDef[];
  purposeType?: string;
  sections?: Array<{ sectionKey: string; label: string; description?: string | null; displaySequence: number }>;
  passingScore?: number | null;
  criticalFailureForcesFailure?: boolean;
  repeatingGroups?: RepeatingGroupDefinition[];
  calculations?: CalculationDefinition[];
  requirementKey: string | null;
  cycleStableKey: string | null;
  cycleLabel: string | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  adHoc?: boolean;
  readOnly?: boolean;
  cancelHref: string;
  /** Partner submits do not send Facility or Department as authority. */
  audience?: "facility" | "partner";
  rules?: CatalogEvidenceRule[];
  followsRecordId?: string | null;
};

function asSnapshots(fields: FieldDef[]): TemplateFieldSnapshot[] {
  return fields.map((field) => ({
    fieldKey: field.fieldKey,
    label: field.label,
    fieldType: field.fieldType as TemplateFieldSnapshot["fieldType"],
    isRequired: field.isRequired,
    displaySequence: field.displaySequence,
    helpText: field.helpText,
    unitLabel: field.unitLabel,
    minNumber: field.minNumber,
    maxNumber: field.maxNumber,
    allowedSelections: field.allowedSelections,
    correctiveActionTrigger: field.correctiveActionTrigger,
    correctiveActionRequired: field.correctiveActionRequired,
  }));
}

export function CanonicalLogEntryForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [media, setMedia] = useState<Record<string, EvidenceMediaInput>>({});
  const [correctiveActionText, setCorrectiveActionText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [existingRecordId, setExistingRecordId] = useState<string | null>(null);
  const [repeatRows, setRepeatRows] = useState<RepeatRowInput[]>([]);
  const [offlineNote, setOfflineNote] = useState<string | null>(null);
  const clientCommandId = useMemo(
    () => `canon-log-${props.requirementKey ?? props.attachmentId}-${crypto.randomUUID()}`,
    [props.requirementKey, props.attachmentId],
  );

  const evaluation = useMemo(
    () =>
      evaluateEvidenceRules({
        fields: asSnapshots(props.fields),
        rules: props.rules ?? [],
        values: formAnswersToValues(props.fields, values, selections),
      }),
    [props.fields, props.rules, values, selections],
  );
  const visible = new Set(evaluation.visibleFieldKeys);
  const required = new Set(evaluation.requiredFieldKeys);
  const repeat = validateRepeatSubmission({ groups: props.repeatingGroups ?? [], rows: repeatRows });
  const calculated = evaluateCalculations({ calculations: props.calculations ?? [], rows: repeatRows });
  const outOfStandard = evaluation.outOfStandardFieldKeys.length > 0 || repeat.outOfStandard;
  const correctiveRequired = evaluation.correctiveActionRequired || repeat.correctiveActionRequired;

  function setValue(fieldKey: string, value: string) {
    setValues((prev) => ({ ...prev, [fieldKey]: value }));
  }

  function setFieldSelections(fieldKey: string, next: string[]) {
    setSelections((prev) => ({ ...prev, [fieldKey]: next }));
  }

  function buildPayload() {
    const all = formAnswersToValues(props.fields, values, selections);
    return dropHiddenFieldValues(all, evaluation.visibleFieldKeys);
  }

  function submit() {
    setError(null);
    setExistingRecordId(null);
    if (outOfStandard && correctiveRequired && !correctiveActionText.trim()) {
      const reason = evaluation.triggeringFields[0]?.reason;
      setError(
        reason
          ? `Corrective action is required: ${reason}.`
          : "Corrective action is required for out-of-standard results.",
      );
      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setOfflineNote(
        (props.repeatingGroups?.length ?? 0) > 0
          ? "You appear offline. Repeating readings and calculations submit online. Open this Log when you are connected."
          : "You appear offline. Photos, files, and signatures need a connection. Open this Log online to submit.",
      );
      return;
    }

    startTransition(async () => {
      const values = buildPayload();
      const mediaPayload = Object.values(media).filter((item) => visible.has(item.fieldKey));
      const corrective = outOfStandard ? correctiveActionText : null;
      const result =
        props.audience === "partner"
          ? await submitPartnerCanonicalLogAction({
              logAttachmentId: props.attachmentId,
              requirementKey: props.requirementKey,
              operationalDateKey: props.operationalDateKey,
              cycleStableKey: props.cycleStableKey,
              cycleLabel: props.cycleLabel,
              windowStartLocal: props.windowStartLocal,
              windowEndLocal: props.windowEndLocal,
              values,
              correctiveActionText: corrective,
              adHoc: props.adHoc === true,
              clientCommandId,
              followsRecordId: props.followsRecordId,
              media: mediaPayload,
              repeatRows,
            })
          : await submitCanonicalRunLogAction({
              facilityId: props.facilityId,
              departmentId: props.departmentId,
              logAttachmentId: props.attachmentId,
              requirementKey: props.requirementKey,
              operationalDateKey: props.operationalDateKey,
              cycleStableKey: props.cycleStableKey,
              cycleLabel: props.cycleLabel,
              windowStartLocal: props.windowStartLocal,
              windowEndLocal: props.windowEndLocal,
              values,
              correctiveActionText: corrective,
              adHoc: props.adHoc === true,
              clientCommandId,
              followsRecordId: props.followsRecordId,
              media: mediaPayload,
              repeatRows,
            });
      if (!result.ok) {
        setError(result.error);
        if (result.existingRecordId) setExistingRecordId(result.existingRecordId);
        return;
      }
      router.push(result.redirectTo);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4" data-testid="canonical-log-entry-form">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-zinc-900">{props.displayName}</h1>
        {props.displayName !== props.catalogDefinitionName ? (
          <p className="text-xs text-zinc-500">{props.catalogDefinitionName}</p>
        ) : null}
        <p className="text-sm text-zinc-700">{props.targetLabel}</p>
        {props.timingContextLabel ? (
          <p className="text-xs text-zinc-600">{props.timingContextLabel}</p>
        ) : null}
      </header>

      {props.catalogInstructions ? (
        <p className="text-sm text-zinc-700">{props.catalogInstructions}</p>
      ) : null}
      {props.localInstructions ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          <span className="font-medium">Facility note: </span>
          {props.localInstructions}
        </p>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
          <p>{error}</p>
          {existingRecordId ? (
            <Link
              href={`${props.audience === "partner" ? "/partner/logs/records" : "/staffing/logs/records"}/${existingRecordId}`}
              className="mt-1 inline-block font-medium underline underline-offset-2"
            >
              View record
            </Link>
          ) : null}
        </div>
      ) : null}
      {offlineNote ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {offlineNote}
        </p>
      ) : null}

      {props.purposeType === "INSPECTION" ? (
        <InspectionAttention
          fields={props.fields}
          values={values}
          visibleFieldKeys={[...visible]}
          sections={props.sections ?? []}
          passingScore={props.passingScore ?? null}
          criticalFailureForcesFailure={props.criticalFailureForcesFailure === true}
        />
      ) : null}

      <CanonicalRepeatGroupControl
        groups={props.repeatingGroups ?? []}
        rows={repeatRows}
        onChange={setRepeatRows}
        readOnly={props.readOnly}
      />
      {calculated.length > 0 ? (
        <ul className="text-sm text-zinc-700">
          {calculated.map((row) => (
            <li key={row.calculationKey}>
              {row.label}: {row.display}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-4">
        {groupInspectionFields(
          props.fields.filter((field) => visible.has(field.fieldKey)),
          props.sections ?? [],
        ).map((group) => (
          <div key={group.key} className="space-y-4">
            {group.title ? (
              <div className="space-y-1 border-b border-zinc-200 pb-1">
                <h2 className="text-sm font-semibold text-zinc-900">{group.title}</h2>
                {group.description ? <p className="text-xs text-zinc-600">{group.description}</p> : null}
              </div>
            ) : null}
            {group.fields.map((field) => {
          const raw = values[field.fieldKey] ?? "";
          const oos = evaluation.fieldOutOfStandard[field.fieldKey] === true;
          const expected = expectedRangeLabel(field);
          const reason = evaluation.triggeringFields.find((row) => row.fieldKey === field.fieldKey)?.reason;
          const inRange =
            (field.fieldType === "TEMPERATURE" || field.fieldType === "NUMBER") &&
            raw.trim() !== "" &&
            !oos;

          return (
            <div key={field.fieldKey} className="space-y-1.5" data-testid={`log-field-${field.fieldKey}`}>
              <label className="block text-sm font-medium text-zinc-900" htmlFor={field.fieldKey}>
                {field.label}
                {required.has(field.fieldKey) ? <span className="text-zinc-500"> *</span> : null}
              </label>
              {field.helpText ? <p className="text-xs text-zinc-500">{field.helpText}</p> : null}
              <CanonicalEvidenceFieldControl
                field={field}
                fieldId={field.fieldKey}
                raw={raw}
                selections={selections[field.fieldKey] ?? []}
                disabled={props.readOnly}
                onChange={(next) => {
                  if (next.raw !== undefined) setValue(field.fieldKey, next.raw);
                  if (next.selections) setFieldSelections(field.fieldKey, next.selections);
                  if (next.media !== undefined) {
                    setMedia((prev) => {
                      const copy = { ...prev };
                      if (next.media) copy[field.fieldKey] = next.media;
                      else delete copy[field.fieldKey];
                      return copy;
                    });
                  }
                }}
              />
              {expected ? (
                <p className="text-xs text-zinc-500">Expected: {expected}</p>
              ) : null}
              {inRange ? <p className="text-xs text-zinc-600">Within range</p> : null}
              {oos ? (
                <p className="text-sm font-medium text-amber-950" data-testid="out-of-range">
                  {reason ?? "Outside expected range"}
                  {expected && !reason ? <span className="font-normal"> · Expected {expected}</span> : null}
                </p>
              ) : null}
            </div>
          );
            })}
          </div>
        ))}
      </div>

      {outOfStandard ? (
        <div className="space-y-1.5" data-testid="corrective-action-field">
          <label htmlFor="corrective-action" className="block text-sm font-medium text-zinc-900">
            Corrective action required
            {correctiveRequired ? <span className="text-zinc-500"> *</span> : null}
          </label>
          <p className="text-xs text-zinc-500">
            {evaluation.triggeringFields.map((row) => row.reason).join(" ") ||
              "Describe what you did in response to this result."}
          </p>
          <textarea
            id="corrective-action"
            value={correctiveActionText}
            disabled={props.readOnly}
            rows={3}
            placeholder="Example: moved food to another cooler and rechecked temperature."
            onChange={(e) => setCorrectiveActionText(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={pending || props.readOnly}
          onClick={submit}
          className="inline-flex min-h-12 min-w-[8rem] items-center justify-center rounded-md border border-zinc-900 bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-60"
          data-testid="submit-log"
        >
          {pending ? "Submitting…" : "Submit"}
        </button>
        <Link
          href={props.cancelHref}
          className="inline-flex min-h-12 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800"
        >
          Cancel
        </Link>
      </div>
    </section>
  );
}

function groupInspectionFields(
  fields: FieldDef[],
  sections: Array<{ sectionKey: string; label: string; description?: string | null; displaySequence: number }>,
) {
  if (sections.length === 0 && fields.every((field) => !field.sectionKey)) {
    return [{ key: "all", title: null as string | null, description: null as string | null, fields }];
  }
  const groups: Array<{ key: string; title: string | null; description: string | null; fields: FieldDef[] }> = [];
  const byKey = new Map<string, FieldDef[]>();
  for (const field of fields) {
    const key = field.sectionKey?.trim() || "";
    const list = byKey.get(key) ?? [];
    list.push(field);
    byKey.set(key, list);
  }
  const ordered = [...sections].sort((a, b) => a.displaySequence - b.displaySequence);
  for (const section of ordered) {
    const rows = byKey.get(section.sectionKey);
    if (!rows || rows.length === 0) continue;
    groups.push({
      key: section.sectionKey,
      title: section.label,
      description: section.description ?? null,
      fields: rows,
    });
    byKey.delete(section.sectionKey);
  }
  for (const [key, rows] of byKey) {
    if (rows.length === 0) continue;
    groups.push({ key: key || "general", title: key ? key : null, description: null, fields: rows });
  }
  return groups;
}

function InspectionAttention(props: {
  fields: FieldDef[];
  values: Record<string, string>;
  visibleFieldKeys: string[];
  sections: Array<{ sectionKey: string; label: string; description?: string | null; displaySequence: number }>;
  passingScore: number | null;
  criticalFailureForcesFailure: boolean;
}) {
  const score = evaluateInspectionScore({
    purposeType: "INSPECTION",
    passingScore: props.passingScore,
    criticalFailureForcesFailure: props.criticalFailureForcesFailure,
    sections: props.sections,
    fields: props.fields,
    values: formAnswersToValues(props.fields, props.values),
    visibleFieldKeys: props.visibleFieldKeys,
  });
  if (!score) return null;
  const attention = score.exceptions.length;
  const critical = score.criticalFailures.length;
  if (attention === 0 && critical === 0) return null;
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      {attention} item{attention === 1 ? "" : "s"} need attention
      {critical > 0 ? ` · ${critical} critical item${critical === 1 ? "" : "s"} failed` : ""}
    </p>
  );
}
