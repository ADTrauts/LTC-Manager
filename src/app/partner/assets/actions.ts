"use server";

import { revalidatePath } from "next/cache";

import { getPartnerFacilitySession } from "@/lib/auth";
import { partnerMaySetUpDepartment } from "@/lib/department-authority/partner-setup";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

export type PartnerAssetResult = { ok: boolean; message: string } | null;

async function setupContext() {
  if (!isContractedDepartmentAuthorityEnabled()) {
    return { ok: false as const, message: "Department setup is not available." };
  }
  const session = await getPartnerFacilitySession();
  if (!session) return { ok: false as const, message: "Sign in to the vendor account first." };
  const context = await requirePartnerOperationalContext();
  const access = await resolveDepartmentAccess(prisma, session, {
    facilityId: session.facilityId,
    departmentId: context.activeDepartmentId,
  });
  if (
    !access ||
    !partnerMaySetUpDepartment({
      mode: access.mode,
      isHead: access.isHead,
      effectiveRole: context.effectiveRole,
    })
  ) {
    return { ok: false as const, message: "Only the Department head or a Partner Manager can add assets." };
  }
  return {
    ok: true as const,
    session,
    facilityId: session.facilityId,
    departmentId: context.activeDepartmentId,
  };
}

export async function addPartnerAssetAction(
  _previous: PartnerAssetResult,
  formData: FormData,
): Promise<PartnerAssetResult> {
  const gate = await setupContext();
  if (!gate.ok) return gate;
  const name = String(formData.get("name") ?? "").trim();
  const equipmentType = String(formData.get("equipmentType") ?? "").trim();
  const unitId = String(formData.get("unitId") ?? "");
  const title = String(formData.get("title") ?? "FACILITY");
  const maintainerId = String(formData.get("responsibleOrganizationId") ?? "").trim();
  const vendorId = String(formData.get("vendorId") ?? "").trim();
  if (!name || !equipmentType) return { ok: false, message: "Enter a name and an equipment type." };
  if (title !== "FACILITY" && title !== "PARTNER") return { ok: false, message: "Choose who owns the equipment." };

  const unit = await prisma.unit.findFirst({
    where: {
      id: unitId,
      facilityId: gate.facilityId,
      departmentResponsibilities: { some: { departmentId: gate.departmentId } },
    },
    select: { id: true },
  });
  if (!unit) return { ok: false, message: "Choose a room this Department is responsible for." };

  let maintainerOrganizationId: string | null = null;
  if (maintainerId) {
    const maintainer = await prisma.facilityOrganization.findFirst({
      where: { id: maintainerId, facilityId: gate.facilityId, isActive: true },
      select: { id: true, organizationId: true },
    });
    if (!maintainer) return { ok: false, message: "Choose a maintainer at this facility." };
    maintainerOrganizationId = maintainer.organizationId;
    if (vendorId) {
      const vendor = await prisma.vendor.findFirst({
        where: { id: vendorId, facilityId: gate.facilityId, ownerOrganizationId: maintainer.id },
        select: { id: true },
      });
      if (!vendor) return { ok: false, message: "Choose a repair vendor from that maintainer's list." };
    }
  } else if (vendorId) {
    return { ok: false, message: "Choose a maintainer before a repair vendor." };
  }

  const ownMaintainer = maintainerOrganizationId === gate.session.partnerOrganizationId;
  const assetCode = `P-${Date.now().toString(36).toUpperCase()}`;
  await prisma.asset.create({
    data: {
      assetCode,
      name,
      equipmentType,
      unitId: unit.id,
      departmentId: gate.departmentId,
      titleKind: title,
      titleOrganizationId: title === "PARTNER" ? gate.session.partnerOrganizationId : null,
      responsibleOrganizationId: ownMaintainer ? maintainerId : null,
      vendorId: ownMaintainer && vendorId ? vendorId : null,
      createdByUserId: gate.session.uid,
      inServiceDate: new Date(new Date().toDateString()),
    },
  });
  if (maintainerId && !ownMaintainer) {
    const created = await prisma.asset.findFirst({
      where: { assetCode },
      select: { id: true },
    });
    if (created) {
      await prisma.assetMaintainerProposal.create({
        data: {
          assetId: created.id,
          facilityOrganizationId: maintainerId,
          proposedByUserId: gate.session.uid,
          status: "PENDING",
        },
      });
    }
  }
  revalidatePath("/partner/assets");
  return {
    ok: true,
    message: maintainerId && !ownMaintainer
      ? "Asset added. The other maintainer still has to accept."
      : "Asset added.",
  };
}
