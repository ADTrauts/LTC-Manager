"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireFacilitySession } from "@/lib/facility-context";
import {
  archiveDepartmentJobRole,
  createDepartmentJobRole,
  updateDepartmentJobRole,
} from "@/lib/department-job-roles";

function revalidateJobRoles() {
  revalidatePath("/employees");
  revalidatePath("/employees/job-roles");
}

export async function createJobRoleAction(formData: FormData) {
  const session = await requireFacilitySession();
  const departmentId = String(formData.get("departmentId") ?? "").trim();
  if (!departmentId) {
    throw new Error("Select a Department to manage its Job Roles.");
  }

  const capabilities = formData
    .getAll("capabilities")
    .map((value) => (typeof value === "string" ? value : ""))
    .filter(Boolean);

  await createDepartmentJobRole(session, {
    facilityId: session.facilityId,
    departmentId,
    displayName: formData.get("displayName"),
    tier: formData.get("tier"),
    description: formData.get("description"),
    capabilities,
  });

  revalidateJobRoles();
  redirect("/employees/job-roles");
}

export async function updateJobRoleAction(formData: FormData) {
  const session = await requireFacilitySession();
  const roleId = String(formData.get("roleId") ?? "").trim();
  if (!roleId) {
    throw new Error("Job Role not found.");
  }

  const capabilities = formData
    .getAll("capabilities")
    .map((value) => (typeof value === "string" ? value : ""))
    .filter(Boolean);

  await updateDepartmentJobRole(session, {
    facilityId: session.facilityId,
    roleId,
    displayName: formData.get("displayName"),
    tier: formData.get("tier"),
    description: formData.get("description"),
    capabilities,
  });

  revalidateJobRoles();
  redirect("/employees/job-roles");
}

export async function archiveJobRoleAction(formData: FormData) {
  const session = await requireFacilitySession();
  const roleId = String(formData.get("roleId") ?? "").trim();
  if (!roleId) {
    throw new Error("Job Role not found.");
  }

  await archiveDepartmentJobRole(session, {
    facilityId: session.facilityId,
    roleId,
  });

  revalidateJobRoles();
  redirect("/employees/job-roles");
}
