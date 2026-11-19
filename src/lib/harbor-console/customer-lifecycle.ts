import type { PrismaClient } from "@prisma/client";

import { accountInviteStatus } from "@/lib/account-invite/status";
import { deriveFacilityDepartmentCatalog } from "@/lib/department-products/facility-catalog";
import { isBillingEntitlementsEnabled } from "@/lib/feature-flags";
import { HOLDER_GONE_REASON_LABEL, loadFacilityAdministratorSeat } from "@/lib/facility-administrator";
import { loadStaffImplementationWorkCounts } from "@/lib/implementation/service";
import type { Actor } from "@/lib/implementation/authority";
import { implementationWorkWhere } from "@/lib/implementation/work-queue";
import { organizationDisplayLabel } from "@/lib/organization-membership/types";
import { ACTIVE_SUPPORT_STATUSES } from "@/lib/support/queues";
import { supportFacilityTicketsHref } from "@/lib/support/history";
import { readHarborAdministratorActivation } from "./administrator-activation";
import { isHarborOwnerSession, validateHarborStaffSession, type HarborJwtPayload } from "./auth";
import { billingStatusLabel, isPaymentProblem, onboardingLabel, setupPathLabel } from "./presentation";

const DETAIL_LIMIT = 200;
type LifecycleFollowUp = { key: string; title: string; detail: string; href: string; action: string };

/** Harbor tenancy/commercial metadata only: never a customer workspace reader or a readiness certification. */
export async function loadHarborCustomerLifecycle(db: PrismaClient, session: HarborJwtPayload, facilityId: string, workFacilityId: string | null) {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    if (!(await validateHarborStaffSession(session, tx)).valid) return { kind: "unauthorized" as const };
    const facility = await tx.facility.findUnique({
      where: { id: facilityId },
      select: {
        id: true, displayName: true, onboardingStartedAt: true, onboardingCurrentStep: true,
        operationsSuspendedAt: true, operationsSuspensionRevision: true,
        onboardingEntryConfirmedAt: true, onboardingCompletedAt: true,
        organization: { select: { id: true, name: true, displayName: true, isActive: true } },
        departments: { take: DETAIL_LIMIT, orderBy: { id: "asc" }, select: { id: true, key: true, isActive: true } },
        _count: { select: { departments: true } },
        billing: {
          select: {
            status: true, setupPath: true, updatedAt: true,
            entitlements: { take: DETAIL_LIMIT, orderBy: { id: "asc" }, select: { departmentKey: true, status: true } },
            _count: { select: { entitlements: true } },
          },
        },
      },
    });
    if (!facility) return { kind: "missing" as const };
    const suspensionHistory = isHarborOwnerSession(session) ? await tx.harborFacilitySuspensionAuditDetail.findMany({
      where: { facilityId }, orderBy: { revision: "desc" }, take: 10,
      select: { revision: true, reason: true, suspendedAt: true, event: { select: { createdAt: true, staff: { select: { displayName: true } } } } },
    }) : null;
    const suspensionHistoryTotal = suspensionHistory ? await tx.harborFacilitySuspensionAuditDetail.count({ where: { facilityId } }) : null;
    const actor: Actor = { kind: "staff", session, workFacilityId };
    const assignedWhere = { facilityId, ...implementationWorkWhere("assigned", session.uid), participants: { some: { staffId: session.uid } } };
    const [seat, activation, implementation, activeSupport, waitingSupport, myWork, myWorkTotal, unlinkedLicenses] = await Promise.all([
      loadFacilityAdministratorSeat(tx, facilityId),
      isHarborOwnerSession(session) ? readHarborAdministratorActivation(tx, facilityId) : null,
      workFacilityId ? null : loadStaffImplementationWorkCounts(tx, actor, facilityId),
      tx.supportTicket.count({ where: { facilityId, status: { in: ACTIVE_SUPPORT_STATUSES } } }),
      tx.supportTicket.count({ where: { facilityId, status: "WAITING_ON_CUSTOMER" } }),
      workFacilityId ? [] : tx.implementationEngagement.findMany({
        where: assignedWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 3,
        select: { id: true, createdAt: true },
      }),
      workFacilityId ? null : tx.implementationEngagement.count({ where: assignedWhere }),
      tx.facilityDepartmentEntitlement.count({ where: { facilityId, status: "ACTIVE", departmentId: null } }),
    ]);
    const licensingComplete = facility._count.departments <= DETAIL_LIMIT && (facility.billing?._count.entitlements ?? 0) <= DETAIL_LIMIT;
    const products = licensingComplete ? deriveFacilityDepartmentCatalog({
      departments: facility.departments,
      entitlements: facility.billing?.entitlements ?? [],
      billingStatus: facility.billing?.status ?? null,
      entitlementsEnforced: isBillingEntitlementsEnabled(),
    }).map((item) => ({
      productKey: item.productKey, name: item.name, releaseStatus: item.releaseStatus,
      licensed: item.licensed, installed: item.installed, enabled: item.departmentActive,
      entitled: item.entitled, operable: item.operable,
    })) : null;
    const observedAt = new Date();
    const customerHref = `/console/customers/${encodeURIComponent(facility.id)}`;
    const followUp: LifecycleFollowUp[] = [];
    if (seat.kind !== "HELD" || !facility.organization.isActive) followUp.push({
      key: "governance", title: "Review current governance", detail: "Review the canonical Organization and Administrator seat. This status view cannot appoint a successor, reactivate an identity, or create authority.",
      href: `${customerHref}#account`, action: "Review account and governance",
    });
    if (activation?.recovery && accountInviteStatus(activation.expiresAt, observedAt) !== "valid") followUp.push({
      key: "invitation", title: "Administrator invitation needs follow-up", detail: "The current account has no password and no valid unused invitation. The existing Owner flow rechecks the current seat and requires confirmation before replacement.",
      href: `${customerHref}#administrator-activation`, action: "Review replacement invitation",
    });
    if (!facility.onboardingCompletedAt || activeSupport > 0) followUp.push({
      key: "support", title: !facility.onboardingCompletedAt ? "Continue setup with the customer" : "Review active Support work",
      detail: !facility.onboardingCompletedAt ? "Guided setup has not been acknowledged. The Administrator continues through their own sign-in; review existing Support before preparing another ticket." : `${activeSupport} active tickets, including ${waitingSupport} waiting on the customer.`,
      href: activeSupport ? supportFacilityTicketsHref(facility.id) : `/console/tickets/new?facilityId=${encodeURIComponent(facility.id)}`,
      action: activeSupport ? "Continue existing Support" : "Prepare Support follow-up",
    });
    if (implementation?.open) followUp.push({
      key: "implementation", title: "Continue Implementation work", detail: `${implementation.open} open requests; ${implementation.unassigned} await assignment. Claims and detailed engagement access remain in the existing service.`,
      href: `${customerHref}/implementation`, action: "Review requests and assignment",
    });
    if (isPaymentProblem(facility.billing?.status) || unlinkedLicenses > 0) followUp.push({
      key: "commercial", title: "Review billing and installation follow-through",
      detail: `${billingStatusLabel(facility.billing?.status)}; ${unlinkedLicenses} active licenses without a Department link. Review local facts before using the existing Stripe-to-Vssyl reconciliation; no provider call runs here.`,
      href: `${customerHref}#billing`, action: "Review billing reconciliation",
    });
    return {
      kind: "found" as const,
      facility: { id: facility.id, displayName: facility.displayName },
      suspension: { at: facility.operationsSuspendedAt, revision: facility.operationsSuspensionRevision, history: suspensionHistory, total: suspensionHistoryTotal },
      organization: { id: facility.organization.id, name: organizationDisplayLabel(facility.organization), active: facility.organization.isActive },
      setup: { label: onboardingLabel(facility), path: setupPathLabel(facility.billing?.setupPath), startedAt: facility.onboardingStartedAt, entryConfirmedAt: facility.onboardingEntryConfirmedAt, acknowledgedAt: facility.onboardingCompletedAt },
      administrator: {
        label: seat.kind === "EMPTY" ? "No current Administrator seat" : seat.kind === "GONE" ? `Seat needs attention: ${HOLDER_GONE_REASON_LABEL[seat.reason]}` : "Administrator seat held",
        // No identity, recovery target, password material, or invitation token leaves this projection.
        activation: activation ? { label: activation.label, expiresAt: activation.expiresAt } : null,
      },
      billing: { label: billingStatusLabel(facility.billing?.status), updatedAt: facility.billing?.updatedAt ?? null, recorded: Boolean(facility.billing) },
      products, implementation, support: { active: activeSupport, waiting: waitingSupport }, observedAt, followUp,
      myWork: { rows: myWork.map((row) => ({ requestedAt: row.createdAt, href: `${customerHref}/implementation?engagement=${encodeURIComponent(row.id)}` })), total: myWorkTotal },
      unlinkedLicenses,
    };
  }, { isolationLevel: "RepeatableRead" });
  if (result.kind === "unauthorized" || !(await validateHarborStaffSession(session, db)).valid) return { kind: "unauthorized" as const };
  return result;
}
