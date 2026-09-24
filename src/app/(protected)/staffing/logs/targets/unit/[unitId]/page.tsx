import { CanonicalTargetRunLogsPage } from "@/components/canonical-logs/canonical-target-run-page";

type Props = { params: Promise<{ unitId: string }> };

export default async function UnitRunLogsPage({ params }: Props) {
  const { unitId } = await params;
  return (
    <CanonicalTargetRunLogsPage
      target={{ kind: "UNIT", id: unitId }}
      subtitle="Unit"
      testId="unit-run-logs-page"
    />
  );
}
