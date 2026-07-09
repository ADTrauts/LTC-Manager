import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { PageHeader } from "@/components/design-system/page-header";
import { ReadinessChip } from "@/components/readiness-chip";
import { resolveLocationIconKey } from "@/lib/design-system";
import type { OperationContext } from "@/lib/operations-center";
import type { UnitReadiness } from "@/lib/readiness/types";

type UnitOperationContextHeaderProps = {
  unitName: string;
  unitType: string;
  unitTypeLabel: string;
  context: OperationContext;
  readiness: UnitReadiness;
};

export function UnitOperationContextHeader({
  unitName,
  unitType,
  unitTypeLabel,
  context,
  readiness,
}: UnitOperationContextHeaderProps) {
  return (
    <PageHeader
      icon={resolveLocationIconKey({ unitType, name: unitName })}
      eyebrow="Orientation"
      title={unitName}
      subtitle={`${unitTypeLabel} · ${context.serviceLabel} · ${context.phase}`}
      status={<ReadinessChip state={readiness.state} className="shrink-0 opacity-90" />}
      compact
      as="div"
      className="border-0 pb-0"
      below={
        <>
          {readiness.state !== "ready" ? (
            <p className="text-sm text-zinc-500">{readiness.reason}</p>
          ) : null}
          <OperationContextBanner context={context} />
        </>
      }
    />
  );
}
