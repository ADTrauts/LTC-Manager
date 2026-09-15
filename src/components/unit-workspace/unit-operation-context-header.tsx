import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { RunLocationOperationCard } from "@/components/unit-workspace/run-location-operation-card";
import { TodaysWorkRunOperationBanner } from "@/components/todays-work/todays-work-run-operation-banner";
import { PageHeader } from "@/components/design-system/page-header";
import { ReadinessChip } from "@/components/readiness-chip";
import { resolveLocationIconKey } from "@/lib/design-system";
import type {
  RunDepartmentOperationPresentation,
  RunLocationIdentity,
  RunLocationOperationPresentation,
} from "@/lib/operational-cycles";
import type { OperationContext } from "@/lib/operations-center";
import type { UnitReadiness } from "@/lib/readiness/types";

type UnitOperationContextHeaderProps = {
  unitName: string;
  unitType: string;
  unitTypeLabel: string;
  context: OperationContext;
  readiness: UnitReadiness;
  selectedRoom?: RunLocationIdentity | null;
  runPresentation?: RunLocationOperationPresentation | null;
  departmentPresentation?: RunDepartmentOperationPresentation | null;
};

export function UnitOperationContextHeader({
  unitName,
  unitType,
  unitTypeLabel,
  context,
  readiness,
  selectedRoom = null,
  runPresentation = null,
  departmentPresentation = null,
}: UnitOperationContextHeaderProps) {
  const location = selectedRoom ?? runPresentation?.location ?? null;
  const newLocationModel = runPresentation?.provenance === "NEW_PERIOD_KEY_TIME";
  const newDepartmentModel = departmentPresentation?.provenance === "NEW_PERIOD_KEY_TIME";
  const title = location?.title ?? unitName;
  const subtitle = location
    ? [location.roomTypeLabel, location.contextLabel].filter(Boolean).join(" · ")
    : newLocationModel || newDepartmentModel
      ? unitTypeLabel
      : `${unitTypeLabel} · ${context.serviceLabel} · ${context.phase}`;

  return (
    <PageHeader
      icon={resolveLocationIconKey({ unitType, name: title })}
      eyebrow="Orientation"
      title={title}
      subtitle={subtitle || undefined}
      status={<ReadinessChip state={readiness.state} className="shrink-0 opacity-90" />}
      compact
      as="div"
      className="border-0 pb-0"
      below={
        <>
          {readiness.state !== "ready" ? (
            <p className="text-sm text-zinc-500">{readiness.reason}</p>
          ) : null}
          {newLocationModel && runPresentation ? (
            <RunLocationOperationCard presentation={runPresentation} />
          ) : newDepartmentModel && departmentPresentation ? (
            <TodaysWorkRunOperationBanner presentation={departmentPresentation} />
          ) : (
            <OperationContextBanner context={context} embedded />
          )}
        </>
      }
    />
  );
}
