import type { PrismaClient } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { loadFacilityDepartmentCatalog } from "@/lib/department-products/load-facility-catalog";
import { loadCurrentOperatorsForFacilityDepartments, organizationDisplayLabel } from "@/lib/department-operators";
import { resolveFacilityClassification } from "@/lib/facility-classification";
import { getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time/service-date";
import { onboardingCommercialStatus } from "./status";
import { listSetupManagerInvitations } from "./manager-invitations";

export async function loadSetupWorkspace(db: PrismaClient, session: FacilitySession) {
  const facility = await db.facility.findUniqueOrThrow({
    where: { id: session.facilityId },
    select: {
      id: true, displayName: true, billingEmail: true, timezone: true, vocabularyProfile: true,
      onboardingCurrentStep: true, onboardingCompletedAt: true, onboardingStartedAt: true, onboardingEntryConfirmedAt: true,
      organization: { select: { id: true, name: true, displayName: true, organizationType: true } },
    },
  });
  const [catalog, billing, managerInvites, locations, rooms, firstUnit, firstRoom] = await Promise.all([
    loadFacilityDepartmentCatalog(db, session.facilityId),
    db.facilityBilling.findUnique({ where: { facilityId: session.facilityId }, select: { status: true, setupPath: true } }),
    listSetupManagerInvitations(db, session.facilityId),
    db.unit.count({ where: { facilityId: session.facilityId, isActive: true } }),
    db.unitSpace.count({ where: { facilityId: session.facilityId, isActive: true } }),
    db.unit.findFirst({ where: { facilityId: session.facilityId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.unitSpace.findFirst({ where: { facilityId: session.facilityId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const firstConfigurationAt = [firstUnit?.createdAt, firstRoom?.createdAt].filter((x): x is Date => Boolean(x)).sort((a,b) => +a-+b)[0] ?? null;
  const departmentIds = catalog.flatMap((product) => product.departmentId ? [product.departmentId] : []);
  const [operators, heads, pendingHeads] = await Promise.all([
    loadCurrentOperatorsForFacilityDepartments(db, { facilityId: session.facilityId, departmentIds }),
    departmentIds.length === 0 ? Promise.resolve([]) : db.department.findMany({
      where: { facilityId: session.facilityId, id: { in: departmentIds } },
      select: { id: true, headEmployee: { select: { id: true, firstName: true, lastName: true } } },
    }),
    departmentIds.length === 0 ? Promise.resolve([]) : db.onboardingManagerInvite.findMany({
      where: { facilityId: session.facilityId, departmentId: { in: departmentIds }, grantAcceptedAt: null, expiresAt: { gt: new Date() } },
      select: { departmentId: true, email: true, firstName: true, lastName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const invitedHead = new Map<string, { name: string; email: string }>();
  for (const row of pendingHeads) {
    if (!row.departmentId || invitedHead.has(row.departmentId)) continue;
    const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
    invitedHead.set(row.departmentId, { name: name || row.email, email: row.email });
  }
  const leadership = departmentIds.map((departmentId) => {
    const operator = operators.get(departmentId);
    const head = heads.find((row) => row.id === departmentId)?.headEmployee ?? null;
    const invited = invitedHead.get(departmentId) ?? null;
    return {
      departmentId,
      operatorLabel: operator ? organizationDisplayLabel(operator.relationship.organization) : facility.organization.displayName || facility.organization.name,
      facilityOperated: operator ? operator.operatingModel === "FACILITY_OPERATED" : true,
      headEmployeeId: head?.id ?? null,
      headName: head ? `${head.firstName} ${head.lastName}` : null,
      invitedHeadName: invited?.name ?? null,
      invitedHeadEmail: invited?.email ?? null,
    };
  });
  return {
    facility, administrator: { id: session.uid, name: session.name, email: session.email },
    classification: resolveFacilityClassification({ organizationType: facility.organization.organizationType, vocabularyProfile: facility.vocabularyProfile }),
    managerInvites, catalog, leadership, serviceDateKey: toServiceDateKey(getFacilityServiceDate(facility.timezone)),
    billingStatus: billing?.status ?? "UNMANAGED",
    setupPath: billing?.setupPath ?? null,
    commercialStatus: onboardingCommercialStatus({ billingStatus: billing?.status ?? null, catalog }),
    structure: { locations, rooms, firstConfigurationAt },
    stripeBillingReady: Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()),
  };
}
export type SetupWorkspace = Awaited<ReturnType<typeof loadSetupWorkspace>>;
