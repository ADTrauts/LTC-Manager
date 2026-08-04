import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { ROLE_PRIORITY, type AppRole } from "@/lib/access";
import { getSession, sessionUserIdForFk } from "@/lib/auth";
import {
  canManageFacilityAccess,
  loadOrganizationFacilitySummaries,
} from "@/lib/facility-access";
import { prisma } from "@/lib/prisma";

import { FacilityAccessManager } from "./facility-access-manager";

function formatLocalTime(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date());
  } catch {
    return timezone;
  }
}

export default async function OrganizationFacilitiesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (ROLE_PRIORITY[session.role as AppRole] < ROLE_PRIORITY.FACILITY_ADMINISTRATOR) {
    redirect("/dashboard");
  }
  if (!canManageFacilityAccess(session.role) || session.authKind !== "user") {
    redirect("/dashboard");
  }

  const actorUserId = sessionUserIdForFk(session);
  if (!actorUserId) redirect("/dashboard");

  const activeFacility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: {
      id: true,
      organizationId: true,
      organization: { select: { id: true, name: true, displayName: true } },
    },
  });
  if (!activeFacility) redirect("/dashboard");

  const summaries = await loadOrganizationFacilitySummaries({
    organizationId: activeFacility.organizationId,
    viewerUserId: actorUserId,
  });

  const orgFacilityIds = summaries.map((s) => s.facilityId);

  const [users, grants] = await Promise.all([
    prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { facilityId: { in: orgFacilityIds } },
          {
            facilityAccesses: {
              some: { facilityId: { in: orgFacilityIds }, isActive: true, revokedAt: null },
            },
          },
        ],
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        facilityId: true,
      },
      orderBy: { displayName: "asc" },
    }),
    prisma.userFacilityAccess.findMany({
      where: {
        facilityId: { in: orgFacilityIds },
        isActive: true,
        revokedAt: null,
      },
      select: {
        id: true,
        userId: true,
        facilityId: true,
        user: { select: { displayName: true, email: true, facilityId: true } },
        facility: { select: { displayName: true } },
      },
      orderBy: [{ user: { displayName: "asc" } }, { facility: { displayName: "asc" } }],
    }),
  ]);

  const orgName =
    activeFacility.organization.displayName?.trim() || activeFacility.organization.name;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AdminPageHeader
        title="Facilities & User Access"
        trail={[
          { label: "Organization Settings", href: "/admin/organization" },
          { label: "Facilities & User Access" },
        ]}
        subtitle={`${orgName}. Multi-site facility visibility and explicit user facility grants. Facility remains the operational scope; access requires an explicit grant. Not required for normal single-facility operation.`}
      />

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">Facility summary</h2>
          <p className="mt-0.5 text-sm text-zinc-600">
            Administrative overview of facilities in this organization. Switch into a facility to
            work operationally.
          </p>
        </div>
        <ul className="divide-y divide-zinc-100" data-testid="org-facility-summary">
          {summaries.map((row) => (
            <li key={row.facilityId} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900">{row.facilityName}</p>
                <p className="text-xs text-zinc-500">
                  {row.timezone} · {formatLocalTime(row.timezone)} ·{" "}
                  {row.onboardingCompleted
                    ? "Setup complete"
                    : row.onboardingCurrentStep
                      ? `Setup: ${row.onboardingCurrentStep}`
                      : "Setup incomplete"}{" "}
                  · {row.activeAccessCount} active access
                  {row.activeAccessCount === 1 ? "" : "es"}
                </p>
              </div>
              <div className="text-xs">
                {row.facilityId === session.facilityId ? (
                  <span className="font-medium text-zinc-700">Current facility</span>
                ) : row.viewerHasAccess ? (
                  <span className="text-zinc-600">Use facility switcher to enter</span>
                ) : (
                  <span className="text-zinc-400">No access grant</span>
                )}
                {row.facilityId === session.facilityId ? (
                  <>
                    {" · "}
                    <Link href="/admin/organization" className="font-medium text-zinc-800 underline">
                      Settings
                    </Link>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <FacilityAccessManager
        facilities={summaries.map((s) => ({ id: s.facilityId, name: s.facilityName }))}
        users={users}
        grants={grants.map((g) => ({
          id: g.id,
          userId: g.userId,
          userName: g.user.displayName,
          userEmail: g.user.email,
          facilityId: g.facilityId,
          facilityName: g.facility.displayName,
          isActive: true,
          isCurrentFacility: g.user.facilityId === g.facilityId,
        }))}
      />
    </div>
  );
}
