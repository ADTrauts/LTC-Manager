import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { ReadinessChip } from "@/components/readiness-chip";
import type { OperationContext } from "@/lib/operations-center";
import type { UnitReadiness } from "@/lib/readiness/types";

type UnitOperationContextHeaderProps = {
  unitName: string;
  unitTypeLabel: string;
  context: OperationContext;
  readiness: UnitReadiness;
};

export function UnitOperationContextHeader({
  unitName,
  unitTypeLabel,
  context,
  readiness,
}: UnitOperationContextHeaderProps) {
  return (
    <div className="min-w-0 space-y-2.5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Orientation</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{unitName}</h1>
          <ReadinessChip state={readiness.state} className="shrink-0 opacity-90" />
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          {unitTypeLabel} · {context.serviceLabel} · {context.phase}
        </p>
        {readiness.state !== "ready" ? (
          <p className="mt-1 text-sm text-zinc-500">{readiness.reason}</p>
        ) : null}
      </div>
      <OperationContextBanner context={context} />
    </div>
  );
}
