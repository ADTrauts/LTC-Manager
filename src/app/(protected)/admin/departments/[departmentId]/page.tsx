import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AreasPanel } from "@/app/(protected)/admin/departments/[departmentId]/areas-panel";
import { ArchetypesPanel } from "@/app/(protected)/admin/departments/[departmentId]/archetypes-panel";
import { DiagnosticsPanel } from "@/app/(protected)/admin/departments/[departmentId]/diagnostics-panel";
import { DepartmentAdminLocalNav } from "@/app/(protected)/admin/departments/[departmentId]/local-nav";
import { OverviewPanel } from "@/app/(protected)/admin/departments/[departmentId]/overview-panel";
import { RoomsPanel } from "@/app/(protected)/admin/departments/[departmentId]/rooms-panel";
import { SettingsPanel } from "@/app/(protected)/admin/departments/[departmentId]/settings-panel";
import { VersionsPanel } from "@/app/(protected)/admin/departments/[departmentId]/versions-panel";
import {
  AdminBreadcrumbs,
  BackToAdministrationLink,
} from "@/components/administration/admin-page-header";
import { PageHeader, StatusBadge } from "@/components/design-system";
import {
  loadDepartmentAdminView,
  profileStatusBadgeVariant,
  resolveDepartmentAdminTab,
} from "@/lib/department-administration";
import { getSession } from "@/lib/auth";
import { isDepartmentOperationalProfilesEnabled } from "@/lib/feature-flags";

type PageProps = {
  params: Promise<{ departmentId: string }>;
  searchParams: Promise<{ tab?: string; profile?: string }>;
};

export default async function DepartmentAdministrationPage({
  params,
  searchParams,
}: PageProps) {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  if (!isDepartmentOperationalProfilesEnabled()) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeader
          eyebrow="Administration"
          title="Department Administration"
          subtitle="Department Operational Profiles are not enabled for this environment."
          icon="administration"
          actions={<BackToAdministrationLink />}
          below={
            <AdminBreadcrumbs
              trail={[
                { label: "Departments", href: "/admin/departments" },
                { label: "Department Administration" },
              ]}
            />
          }
        />
        <p className="text-sm text-zinc-600">
          Set <code className="rounded bg-zinc-100 px-1">DEPARTMENT_OPERATIONAL_PROFILES_ENABLED=true</code>{" "}
          to author operational models. No runtime surfaces consume profiles yet.
        </p>
        <Link
          href="/admin/departments"
          className="text-sm font-medium text-zinc-900 underline-offset-2 hover:underline"
        >
          Back to Departments
        </Link>
      </div>
    );
  }

  const { departmentId } = await params;
  const query = await searchParams;
  const tab = resolveDepartmentAdminTab(query.tab);
  const view = await loadDepartmentAdminView({
    facilityId: session.facilityId,
    departmentId,
    requestedProfileId: query.profile ?? null,
  });

  if (!view) {
    notFound();
  }

  const profileId = view.workingProfileMeta?.id ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Administration"
        icon="operationalMode"
        title={view.department.name}
        subtitle="Configure how this department operates. The Operational Profile is the persisted output — Projection will consume it later."
        status={
          view.workingProfileMeta ? (
            <StatusBadge
              variant={profileStatusBadgeVariant(view.workingProfileMeta.status)}
            >
              {view.workingProfileMeta.status} · v{view.workingProfileMeta.version}
            </StatusBadge>
          ) : (
            <StatusBadge variant="neutral">No profile</StatusBadge>
          )
        }
        actions={
          <>
            <Link
              href="/admin/departments"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              All departments
            </Link>
            <BackToAdministrationLink />
          </>
        }
        below={
          <AdminBreadcrumbs
            trail={[
              { label: "Departments", href: "/admin/departments" },
              { label: view.department.name },
            ]}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <DepartmentAdminLocalNav
          departmentId={view.department.id}
          activeTab={tab}
          profileId={profileId}
        />
        <div className="min-w-0">
          {tab === "overview" ? <OverviewPanel view={view} /> : null}
          {tab === "areas" ? <AreasPanel view={view} /> : null}
          {tab === "archetypes" ? <ArchetypesPanel view={view} /> : null}
          {tab === "rooms" ? <RoomsPanel view={view} /> : null}
          {tab === "diagnostics" ? <DiagnosticsPanel view={view} /> : null}
          {tab === "versions" ? <VersionsPanel view={view} /> : null}
          {tab === "settings" ? <SettingsPanel view={view} /> : null}
        </div>
      </div>
    </div>
  );
}
