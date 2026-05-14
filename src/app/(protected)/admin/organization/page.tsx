import Link from "next/link";
import { redirect } from "next/navigation";

import { ROLE_PRIORITY, type AppRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { getFacilityForSession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";

import { BindDeviceForm } from "@/components/bind-device-form";

import { FacilitySettingsForm } from "./facility-settings-form";
import { UnionHandbookSettings } from "./union-handbook-settings";

export default async function AdminOrganizationPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (ROLE_PRIORITY[session.role as AppRole] < ROLE_PRIORITY.GM) {
    redirect("/dashboard");
  }

  const facility =
    (await getFacilityForSession()) ??
    (await prisma.facility.findUnique({
      where: { id: session.facilityId },
      select: {
        id: true,
        displayName: true,
        managementCompanyName: true,
        brandColor: true,
        unionHandbookPdfPath: true,
        unionHandbookOriginalFilename: true,
        unionHandbookUploadedAt: true,
        unionHandbookEffectiveDate: true,
      },
    }));

  if (!facility) {
    redirect("/dashboard");
  }

  const units = await prisma.unit.findMany({
    where: { facilityId: facility.id, isActive: true },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-zinc-500">
          <Link href="/admin" className="font-medium text-zinc-700 hover:text-zinc-900">
            Admin
          </Link>
          <span className="mx-1.5 text-zinc-400">/</span>
          <span className="text-zinc-600">Organization</span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Organization</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Facility name and management company appear in the app header and footer. Only General Managers can edit
          these settings.
        </p>
      </div>
      <FacilitySettingsForm facility={facility} />
      <UnionHandbookSettings
        hasPdf={Boolean(facility.unionHandbookPdfPath)}
        originalFilename={facility.unionHandbookOriginalFilename}
        uploadedAtIso={facility.unionHandbookUploadedAt?.toISOString() ?? null}
        effectiveDateIso={
          facility.unionHandbookEffectiveDate
            ? facility.unionHandbookEffectiveDate.toISOString().slice(0, 10)
            : null
        }
      />
      <BindDeviceForm units={units} />
    </div>
  );
}
