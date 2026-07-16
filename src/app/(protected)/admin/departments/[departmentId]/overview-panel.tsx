import Link from "next/link";

import {
  activateProfileAction,
  certifyProfileAction,
  createBaselineDraftAction,
  createNextDraftAction,
  retireProfileAction,
} from "@/app/(protected)/admin/departments/[departmentId]/actions";
import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import {
  AppCard,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/design-system";
import {
  departmentAdminHref,
  experienceDisplayName,
  profileStatusBadgeVariant,
  type DepartmentAdminView,
} from "@/lib/department-administration";

type Props = {
  view: DepartmentAdminView;
};

export function OverviewPanel({ view }: Props) {
  const { department, workingProfile, workingProfileMeta, coverage, certification } =
    view;
  const profileId = workingProfileMeta?.id ?? null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Overview"
        description="How this department is configured to operate. The Operational Profile is the persisted output."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Status"
          value={workingProfileMeta?.status ?? "None"}
          tone={
            workingProfileMeta
              ? profileStatusBadgeVariant(workingProfileMeta.status) === "success"
                ? "success"
                : profileStatusBadgeVariant(workingProfileMeta.status) === "warning"
                  ? "warning"
                  : "neutral"
              : "neutral"
          }
        />
        <MetricCard
          label="Version"
          value={workingProfileMeta ? `v${workingProfileMeta.version}` : "—"}
        />
        <MetricCard
          label="Room coverage"
          value={`${coverage.mappedRooms}/${coverage.assignedRooms}`}
          hint={`${coverage.unmappedRooms} unmapped`}
          tone={coverage.unmappedRooms > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="Experiences"
          value={String(coverage.activeExperiences)}
          hint={`${coverage.activeAreas} areas · ${coverage.activeArchetypes} archetypes`}
        />
      </div>

      <AppCard
        title={department.name}
        subtitle={
          workingProfileMeta
            ? `${workingProfileMeta.name} · baseline ${workingProfileMeta.baselineKey ?? "custom"}`
            : "No operational profile yet. Create a draft from the system baseline to begin."
        }
        actions={
          workingProfileMeta ? (
            <StatusBadge variant={profileStatusBadgeVariant(workingProfileMeta.status)}>
              {workingProfileMeta.status}
            </StatusBadge>
          ) : null
        }
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Last activated
            </dt>
            <dd className="mt-1 text-zinc-900">
              {workingProfileMeta?.activatedAt
                ? workingProfileMeta.activatedAt.toLocaleString()
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Certified
            </dt>
            <dd className="mt-1 text-zinc-900">
              {workingProfileMeta?.certifiedAt
                ? workingProfileMeta.certifiedAt.toLocaleString()
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Diagnostics
            </dt>
            <dd className="mt-1 text-zinc-900">
              {certification
                ? certification.certifiable
                  ? `Ready · ${certification.diagnostics.length} warning(s)`
                  : `${certification.errors.length} blocker(s) · ${certification.diagnostics.length} warning(s)`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Working profile
            </dt>
            <dd className="mt-1 font-mono text-xs text-zinc-700">
              {profileId ?? "none"}
            </dd>
          </div>
        </dl>
      </AppCard>

      <AppCard title="Quick actions">
        <div className="flex flex-wrap gap-2">
          {!workingProfile ? (
            <DepartmentAdminActionForm
              action={createBaselineDraftAction}
              onSuccessRedirect={(result) =>
                result.ok && result.profileId
                  ? departmentAdminHref(department.id, "overview", result.profileId)
                  : null
              }
            >
              <input type="hidden" name="departmentId" value={department.id} />
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Create Draft from Baseline
              </button>
            </DepartmentAdminActionForm>
          ) : null}

          {workingProfileMeta?.status === "DRAFT" && profileId ? (
            <DepartmentAdminActionForm action={certifyProfileAction}>
              <input type="hidden" name="profileId" value={profileId} />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
              >
                Certify
              </button>
            </DepartmentAdminActionForm>
          ) : null}

          {workingProfileMeta?.status === "CERTIFIED" && profileId ? (
            <DepartmentAdminActionForm action={activateProfileAction}>
              <input type="hidden" name="profileId" value={profileId} />
              <button
                type="submit"
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Activate
              </button>
            </DepartmentAdminActionForm>
          ) : null}

          {workingProfileMeta?.status === "ACTIVE" && profileId ? (
            <>
              <DepartmentAdminActionForm
                action={createNextDraftAction}
                onSuccessRedirect={(result) =>
                  result.ok && result.profileId
                    ? departmentAdminHref(department.id, "overview", result.profileId)
                    : null
                }
              >
                <input type="hidden" name="profileId" value={profileId} />
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Create Draft from Active
                </button>
              </DepartmentAdminActionForm>
              <DepartmentAdminActionForm action={retireProfileAction}>
                <input type="hidden" name="profileId" value={profileId} />
                <button
                  type="submit"
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
                >
                  Retire
                </button>
              </DepartmentAdminActionForm>
            </>
          ) : null}

          {workingProfileMeta &&
          workingProfileMeta.status !== "DRAFT" &&
          workingProfileMeta.status !== "ACTIVE" &&
          profileId ? (
            <DepartmentAdminActionForm
              action={createNextDraftAction}
              onSuccessRedirect={(result) =>
                result.ok && result.profileId
                  ? departmentAdminHref(department.id, "overview", result.profileId)
                  : null
              }
            >
              <input type="hidden" name="profileId" value={profileId} />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
              >
                Create Draft Version
              </button>
            </DepartmentAdminActionForm>
          ) : null}

          <Link
            href={departmentAdminHref(department.id, "diagnostics", profileId)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            View Diagnostics
          </Link>
        </div>
      </AppCard>

      {workingProfile ? (
        <AppCard title="Areas at a glance" subtitle="Active Experiences by Operational Area">
          <ul className="divide-y divide-zinc-100">
            {workingProfile.areas
              .filter((area) => area.isActive)
              .map((area) => (
                <li key={area.id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{area.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {area.experiences
                        .filter((e) => e.isActive)
                        .map((e) => experienceDisplayName(e.experienceKey))
                        .join(" · ") || "No active Experiences"}
                    </p>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {area.experiences.filter((e) => e.isActive).length}
                  </span>
                </li>
              ))}
          </ul>
        </AppCard>
      ) : null}
    </div>
  );
}
