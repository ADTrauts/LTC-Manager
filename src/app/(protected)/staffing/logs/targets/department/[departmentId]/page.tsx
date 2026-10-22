import { redirect } from "next/navigation";

import { CanonicalTargetRunLogsPage } from "@/components/canonical-logs/canonical-target-run-page";
import { getSession } from "@/lib/auth";
import { assertVisibleDepartment } from "@/lib/department-authority/visibility";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ departmentId: string }> };

export default async function DepartmentRunLogsPage({ params }: Props) {
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  const { departmentId } = await params;
  await assertVisibleDepartment(prisma, session, session.facilityId, departmentId);
  return (
    <CanonicalTargetRunLogsPage
      target={{ kind: "DEPARTMENT", id: departmentId }}
      subtitle="Department"
      testId="department-run-logs-page"
    />
  );
}
