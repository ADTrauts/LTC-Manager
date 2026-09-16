import Link from "next/link";

import type { EmployeeCycleContextCard } from "@/lib/operational-cycles";
import { formatCycleHierarchyLabel } from "@/lib/operational-cycles";

type Props = {
  card: EmployeeCycleContextCard;
  canManage?: boolean;
};

function expectedMilestoneText(card: EmployeeCycleContextCard): string | null {
  const { context } = card;
  if (context.state === "ACTIVE") {
    const milestones = context.primary.expectedMilestones;
    if (milestones.length === 0) return null;
    return `Expected: ${milestones.join(", ").replaceAll("_", " ")}`;
  }
  if (context.state === "UPCOMING" || context.state === "BETWEEN") {
    const milestones = context.next.expectedMilestones;
    if (milestones.length === 0) return null;
    return `Next expected: ${milestones.join(", ").replaceAll("_", " ")}`;
  }
  return null;
}

function mealTargetText(card: EmployeeCycleContextCard): string | null {
  const { context } = card;
  let mealType: string | null = null;
  let target: string | null = null;

  switch (context.state) {
    case "ACTIVE":
      mealType = context.primary.mealType;
      target = context.mealTargetTime;
      break;
    case "UPCOMING":
    case "BETWEEN":
      mealType = context.next.mealType;
      target = context.mealTargetTime;
      break;
    case "DAY_COMPLETE":
      mealType = context.last.mealType;
      target = context.mealTargetTime;
      break;
    default:
      break;
  }

  if (!mealType && !target) return null;
  if (mealType && target) return `Expected service: ${target}`;
  if (mealType) return `Meal: ${mealType}`;
  return target ? `Expected service: ${target}` : null;
}

export function UnitCycleContextPanel({ card, canManage = false }: Props) {
  const { context, departmentId } = card;
  const builderHref = `/admin/departments/${departmentId}?tab=cycles`;

  if (context.state === "NOT_CONFIGURED") {
    return (
      <article
        className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
        data-testid="unit-cycle-context"
      >
        <p className="text-xs font-medium text-zinc-500">Current operation</p>
        <p className="mt-0.5 text-sm text-zinc-700">Operational cycles not configured</p>
        {canManage ? (
          <p className="mt-2 text-xs text-zinc-600">
            <Link
              href={builderHref}
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              Open Department Builder
            </Link>{" "}
            to publish cycles for this department.
          </p>
        ) : null}
      </article>
    );
  }

  if (context.state === "NOT_APPLICABLE") {
    return (
      <article
        className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
        data-testid="unit-cycle-context"
      >
        <p className="text-xs font-medium text-zinc-500">Current operation</p>
        <p className="mt-0.5 text-sm text-zinc-700">{card.description}</p>
      </article>
    );
  }

  let phaseLabel: string | null = null;
  let parentLabel: string | null = null;
  let nextLabel: string | null = null;
  let windowText: string | null = null;

  switch (context.state) {
    case "ACTIVE":
      phaseLabel = context.primary.label;
      parentLabel = context.primary.ancestorLabels[0] ?? null;
      nextLabel = context.next ? formatCycleHierarchyLabel(context.next) : null;
      windowText = `${context.primary.startLocal}–${context.primary.endLocal}`;
      break;
    case "UPCOMING":
      phaseLabel = context.next.label;
      parentLabel = context.next.ancestorLabels[0] ?? null;
      windowText = `${context.next.startLocal}–${context.next.endLocal}`;
      break;
    case "BETWEEN":
      phaseLabel = `${context.previous.label} (ended)`;
      parentLabel = context.previous.ancestorLabels[0] ?? null;
      nextLabel = formatCycleHierarchyLabel(context.next);
      windowText = `Next ${context.next.startLocal}–${context.next.endLocal}`;
      break;
    case "DAY_COMPLETE":
      phaseLabel = context.last.label;
      parentLabel = context.last.ancestorLabels[0] ?? null;
      windowText = `${context.last.startLocal}–${context.last.endLocal}`;
      break;
  }

  const milestones = card.keyTimes?.length ? null : expectedMilestoneText(card);
  const mealTarget = card.keyTimes?.length ? null : mealTargetText(card);

  return (
    <article
      className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
      data-testid="unit-cycle-context"
    >
      <p className="text-xs font-medium text-zinc-500">Current operation</p>
      {parentLabel ? (
        <p className="mt-0.5 text-sm font-semibold text-zinc-900">{parentLabel}</p>
      ) : null}
      {phaseLabel ? (
        <p className={`text-sm ${parentLabel ? "text-zinc-800" : "font-semibold text-zinc-900"}`}>
          {phaseLabel}
          {windowText && context.state === "ACTIVE" ? (
            <span className="font-normal text-zinc-600"> · {windowText}</span>
          ) : null}
        </p>
      ) : (
        <p className="mt-0.5 text-sm text-zinc-700">{card.description}</p>
      )}
      {mealTarget ? <p className="mt-1 text-xs text-zinc-600">{mealTarget}</p> : null}
      {milestones ? <p className="mt-0.5 text-xs text-zinc-600">{milestones}</p> : null}
      {nextLabel ? (
        <p className="mt-1 text-xs text-zinc-500">Upcoming: {nextLabel}</p>
      ) : null}
      {card.keyTimes?.length ? (
        <div className="mt-3 space-y-2 border-t border-zinc-100 pt-2" data-testid="unit-key-times">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Key Times
          </p>
          {card.keyTimes?.map((keyTime) => (
            <div key={keyTime.expectationId} className="text-xs text-zinc-700">
              <p className="font-medium text-zinc-900">
                {keyTime.parentCycleLabel
                  ? `${keyTime.parentCycleLabel} → ${keyTime.cycleLabel}`
                  : keyTime.cycleLabel}
                {keyTime.spaceName ? (
                  <span className="font-normal text-zinc-600"> · {keyTime.spaceName}</span>
                ) : null}
              </p>
              {keyTime.facilityRoomTypeName ? (
                <p className="text-zinc-500">Room Type: {keyTime.facilityRoomTypeName}</p>
              ) : null}
              <p>
                {keyTime.actualDueLocal
                  ? keyTime.status.label
                  : keyTime.adjustedDueLocal
                    ? `Adjusted to ${keyTime.expectedToday} · ${keyTime.status.label}`
                    : keyTime.status.label}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
