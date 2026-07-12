import Link from "next/link";

import { AppCard } from "@/components/design-system/AppCard";
import { EmptyState } from "@/components/design-system/EmptyState";
import { SectionHeader } from "@/components/design-system/SectionHeader";
import { StatusBadge } from "@/components/design-system/StatusBadge";
import type { StatusBadgeVariant } from "@/lib/design-system/status-styles";
import type {
  UnitInspectionDefinitionRow,
  UnitInspectionHistoryRow,
} from "@/lib/work/inspections/list-unit-inspections";
import { inspectionResultOperatorCopy } from "@/lib/work/inspections/result-copy";

type UnitInspectionsPanelProps = {
  unitId: string;
  available: UnitInspectionDefinitionRow[];
  history: UnitInspectionHistoryRow[];
  facilityTimezone?: string | null;
  activeInspectId?: string | null;
};

function formatSubmittedAt(value: Date, facilityTimezone?: string | null) {
  try {
    return value.toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
      ...(facilityTimezone ? { timeZone: facilityTimezone } : {}),
    });
  } catch {
    return value.toLocaleString();
  }
}

function resultVariant(result: UnitInspectionHistoryRow["result"]): StatusBadgeVariant {
  if (result === "PASSED") return "ready";
  if (result === "PASSED_WITH_FINDINGS") return "warning";
  return "blocked";
}

export function UnitInspectionsPanel({
  unitId,
  available,
  history,
  facilityTimezone,
  activeInspectId,
}: UnitInspectionsPanelProps) {
  return (
    <AppCard as="section" data-testid="unit-inspections-panel" className="space-y-4">
      <SectionHeader
        title="Inspections"
        description="Available checklists for this unit. Completing an inspection does not replace required logs."
      />

      {available.length === 0 ? (
        <EmptyState
          icon="ready"
          title="No inspections assigned"
          description="When an active inspection is scoped to this unit or left facility-wide, it appears here."
          tone="neutral"
          inset
        />
      ) : (
        <ul className="space-y-2.5">
          {available.map((definition) => {
            const isOpen = activeInspectId === definition.id;
            return (
              <li key={definition.id}>
                <div className="rounded-lg border border-zinc-200 bg-white p-3.5">
                  <p className="text-sm font-semibold text-zinc-900">{definition.name}</p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {definition.itemCount} checks
                    {definition.frequency ? ` · ${definition.frequency}` : ""}
                    {definition.description ? ` — ${definition.description}` : ""}
                  </p>
                  <div className="mt-3">
                    <Link
                      href={
                        isOpen
                          ? `/unit/${unitId}?unitTab=overview`
                          : `/unit/${unitId}?unitTab=overview&inspect=${definition.id}`
                      }
                      className="inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white touch-manipulation hover:bg-zinc-700"
                    >
                      {isOpen ? "Close form" : "Start inspection"}
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <SectionHeader eyebrow="Recent inspection history" className="mb-2" />
        {history.length === 0 ? (
          <p className="text-sm text-zinc-500">No inspections submitted for this unit yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((row) => {
              const copy = inspectionResultOperatorCopy(row.result);
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-1 rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{row.definitionName}</p>
                    <p className="text-xs text-zinc-500">
                      {formatSubmittedAt(row.submittedAt, facilityTimezone)}
                      {row.submittedByName ? ` · ${row.submittedByName}` : ""}
                    </p>
                  </div>
                  <StatusBadge variant={resultVariant(row.result)}>{copy.title}</StatusBadge>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppCard>
  );
}
