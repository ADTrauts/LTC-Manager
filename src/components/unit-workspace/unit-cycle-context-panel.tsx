import Link from "next/link";

import type { EmployeeCycleContextCard } from "@/lib/operational-cycles";

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
  if (mealType && target) return `Meal target: ${mealType} at ${target}`;
  if (mealType) return `Meal: ${mealType}`;
  return target ? `Meal target: ${target}` : null;
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
        <p className="text-xs font-medium text-zinc-500">Operational cycle</p>
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
        <p className="text-xs font-medium text-zinc-500">Operational cycle</p>
        <p className="mt-0.5 text-sm text-zinc-700">{card.description}</p>
      </article>
    );
  }

  let currentLabel: string | null = null;
  let nextLabel: string | null = null;
  let windowText: string | null = null;

  switch (context.state) {
    case "ACTIVE":
      currentLabel = context.primary.label;
      nextLabel = context.next?.label ?? null;
      windowText = `${context.primary.startLocal}–${context.primary.endLocal}`;
      break;
    case "UPCOMING":
      nextLabel = context.next.label;
      windowText = `${context.next.startLocal}–${context.next.endLocal}`;
      break;
    case "BETWEEN":
      currentLabel = `${context.previous.label} (ended)`;
      nextLabel = context.next.label;
      windowText = `Next ${context.next.startLocal}–${context.next.endLocal}`;
      break;
    case "DAY_COMPLETE":
      currentLabel = context.last.label;
      windowText = `${context.last.startLocal}–${context.last.endLocal}`;
      break;
  }

  const milestones = expectedMilestoneText(card);
  const mealTarget = mealTargetText(card);

  return (
    <article
      className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
      data-testid="unit-cycle-context"
    >
      <p className="text-xs font-medium text-zinc-500">Operational cycle</p>
      {currentLabel ? (
        <p className="mt-0.5 text-sm font-semibold text-zinc-900">
          {currentLabel}
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
        <p className="mt-1 text-xs text-zinc-500">Next cycle: {nextLabel}</p>
      ) : null}
    </article>
  );
}
