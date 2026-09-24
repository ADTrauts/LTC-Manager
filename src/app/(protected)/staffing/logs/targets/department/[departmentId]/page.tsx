import { CanonicalTargetRunLogsPage } from "@/components/canonical-logs/canonical-target-run-page";

type Props = { params: Promise<{ departmentId: string }> };

export default async function DepartmentRunLogsPage({ params }: Props) {
  const { departmentId } = await params;
  return (
    <CanonicalTargetRunLogsPage
      target={{ kind: "DEPARTMENT", id: departmentId }}
      subtitle="Department"
      testId="department-run-logs-page"
    />
  );
}
