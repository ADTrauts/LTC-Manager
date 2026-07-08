import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import type { OperationContext } from "@/lib/operations-center";

type UnitOperationContextHeaderProps = {
  unitName: string;
  unitTypeLabel: string;
  context: OperationContext;
};

export function UnitOperationContextHeader({
  unitName,
  unitTypeLabel,
  context,
}: UnitOperationContextHeaderProps) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Orientation</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{unitName}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {unitTypeLabel} · {context.serviceLabel} · {context.phase}
        </p>
      </div>
      <OperationContextBanner context={context} />
    </div>
  );
}
