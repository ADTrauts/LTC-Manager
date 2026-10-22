import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AnswerVendorHeadForm,
  AssignVendorHeadForm,
  MoveVendorStaffForm,
} from "@/app/(organization-account)/organization/[organizationId]/departments/vendor-head-forms";
import {
  listAssignableVendorMembers,
  listVendorOperatedDepartments,
} from "@/lib/department-authority/vendor-heads";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { requireOrganizationSession } from "@/lib/organization-context";
import { organizationDisplayLabel } from "@/lib/organization-membership";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ organizationId: string }> };

export default async function OrganizationDepartmentsPage({ params }: PageProps) {
  const { organizationId } = await params;
  let session;
  let membership;
  try {
    const required = await requireOrganizationSession();
    session = required.session;
    membership = required.membership;
  } catch {
    redirect("/login");
  }
  if (session.organizationId !== organizationId) redirect("/organization");

  const enabled = isContractedDepartmentAuthorityEnabled();
  const isAdmin = membership.currentRole === "ORG_ADMIN";
  const [departments, members] = enabled
    ? await Promise.all([
        listVendorOperatedDepartments(prisma, { organizationId }),
        isAdmin ? listAssignableVendorMembers(prisma, organizationId) : Promise.resolve([]),
      ])
    : [[], []];

  return (
    <div className="space-y-6" data-testid="organization-vendor-departments">
      <div>
        <p className="text-xs text-zinc-500">
          <Link href={`/organization/${organizationId}`} className="underline-offset-2 hover:underline">
            {organizationDisplayLabel(membership.organization)}
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Departments</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Name the head of a Department this organization runs. The facility keeps control until that person accepts.
        </p>
      </div>

      {!enabled ? (
        <p className="text-sm text-zinc-600">Vendor head assignment is not in effect.</p>
      ) : departments.length === 0 ? (
        <p className="text-sm text-zinc-600">This organization does not run a vendor Department today.</p>
      ) : (
        <ul className="space-y-4">
          {departments.map((department) => {
            const mine = department.assignment?.assigneeUserId === session.uid;
            return (
              <li
                key={department.departmentId}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-4"
                data-testid="vendor-operated-department"
              >
                <h2 className="text-sm font-semibold text-zinc-900">
                  {department.departmentName}
                  <span className="font-normal text-zinc-500"> · {department.facilityName}</span>
                </h2>
                {department.assignment ? (
                  <p className="mt-1 text-sm text-zinc-700" data-testid="vendor-head-status">
                    {department.assignment.status === "ACCEPTED"
                      ? `${department.assignment.assigneeName} runs this Department.`
                      : `Waiting for ${department.assignment.assigneeName} (${department.assignment.assigneeEmail}) to accept.`}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-zinc-700" data-testid="vendor-head-status">
                    No head yet. The facility still runs this Department.
                  </p>
                )}
                {department.assignment?.status === "PENDING" && mine ? (
                  <AnswerVendorHeadForm organizationId={organizationId} assignmentId={department.assignment.id} />
                ) : null}
                {isAdmin ? (
                  <AssignVendorHeadForm
                    organizationId={organizationId}
                    departmentId={department.departmentId}
                    members={members}
                  />
                ) : null}
                {isAdmin ? (
                  <MoveVendorStaffForm organizationId={organizationId} departmentId={department.departmentId} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
