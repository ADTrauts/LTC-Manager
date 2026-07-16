import Link from "next/link";

import {
  activateProfileAction,
  createBaselineDraftAction,
  createNextDraftAction,
  retireProfileAction,
} from "@/app/(protected)/admin/departments/[departmentId]/actions";
import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import { AppCard, SectionHeader, StatusBadge } from "@/components/design-system";
import {
  departmentAdminHref,
  profileStatusBadgeVariant,
  type DepartmentAdminView,
} from "@/lib/department-administration";

type Props = {
  view: DepartmentAdminView;
};

export function VersionsPanel({ view }: Props) {
  const { department, profiles, workingProfileMeta } = view;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Versions"
        description="History is retained. Certified and active versions are never deleted."
      />

      {profiles.length === 0 ? (
        <AppCard title="No versions yet">
          <DepartmentAdminActionForm
            action={createBaselineDraftAction}
            onSuccessRedirect={(result) =>
              result.ok && result.profileId
                ? departmentAdminHref(department.id, "versions", result.profileId)
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
        </AppCard>
      ) : null}

      <ol className="space-y-3">
        {profiles.map((profile) => {
          const isWorking = workingProfileMeta?.id === profile.id;
          return (
            <li key={profile.id}>
              <AppCard
                title={`Version ${profile.version}`}
                subtitle={profile.name}
                actions={
                  <div className="flex items-center gap-2">
                    <StatusBadge variant={profileStatusBadgeVariant(profile.status)}>
                      {profile.status}
                    </StatusBadge>
                    {isWorking ? (
                      <StatusBadge variant="in_progress">Working</StatusBadge>
                    ) : null}
                  </div>
                }
              >
                <dl className="mb-3 grid gap-2 text-xs text-zinc-600 sm:grid-cols-3">
                  <div>
                    <dt className="font-medium text-zinc-500">Baseline</dt>
                    <dd>{profile.baselineKey ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500">Activated</dt>
                    <dd>
                      {profile.activatedAt
                        ? profile.activatedAt.toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500">Retired</dt>
                    <dd>
                      {profile.retiredAt ? profile.retiredAt.toLocaleString() : "—"}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  {!isWorking ? (
                    <Link
                      href={departmentAdminHref(
                        department.id,
                        "overview",
                        profile.id,
                      )}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                    >
                      Open
                    </Link>
                  ) : null}
                  {profile.status === "CERTIFIED" ? (
                    <DepartmentAdminActionForm action={activateProfileAction}>
                      <input type="hidden" name="profileId" value={profile.id} />
                      <button
                        type="submit"
                        className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                      >
                        Activate
                      </button>
                    </DepartmentAdminActionForm>
                  ) : null}
                  {profile.status === "ACTIVE" ? (
                    <>
                      <DepartmentAdminActionForm
                        action={createNextDraftAction}
                        onSuccessRedirect={(result) =>
                          result.ok && result.profileId
                            ? departmentAdminHref(
                                department.id,
                                "versions",
                                result.profileId,
                              )
                            : null
                        }
                      >
                        <input type="hidden" name="profileId" value={profile.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                        >
                          Create Draft
                        </button>
                      </DepartmentAdminActionForm>
                      <DepartmentAdminActionForm action={retireProfileAction}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900"
                        >
                          Retire
                        </button>
                      </DepartmentAdminActionForm>
                    </>
                  ) : null}
                  {(profile.status === "CERTIFIED" ||
                    profile.status === "RETIRED") &&
                  !profiles.some((p) => p.status === "DRAFT") ? (
                    <DepartmentAdminActionForm
                      action={createNextDraftAction}
                      onSuccessRedirect={(result) =>
                        result.ok && result.profileId
                          ? departmentAdminHref(
                              department.id,
                              "versions",
                              result.profileId,
                            )
                          : null
                      }
                    >
                      <input type="hidden" name="profileId" value={profile.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                      >
                        Create Draft from this version
                      </button>
                    </DepartmentAdminActionForm>
                  ) : null}
                </div>
              </AppCard>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
