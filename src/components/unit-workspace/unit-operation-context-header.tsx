import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import type { OperationContext } from "@/lib/operations-center";

type UnitOperationContextHeaderProps = {
  unitName: string;
  context: OperationContext;
};

export function UnitOperationContextHeader({ unitName, context }: UnitOperationContextHeaderProps) {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{unitName}</h1>
        <p className="mt-1 text-sm text-zinc-600">Unit workspace — {context.serviceLabel}</p>
      </div>
      <OperationContextBanner context={context} />
    </div>
  );
}
