import {
  moveExperienceAction,
  reorderExperiencesAction,
  setExperienceActiveAction,
} from "@/app/(protected)/admin/departments/[departmentId]/actions";
import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import { AppCard, SectionHeader, StatusBadge } from "@/components/design-system";
import {
  experienceDisplayName,
  type DepartmentAdminView,
} from "@/lib/department-administration";

type Props = {
  view: DepartmentAdminView;
};

export function AreasPanel({ view }: Props) {
  const profile = view.workingProfile;
  const editable = view.editable;
  const profileId = view.workingProfileMeta?.id;

  if (!profile || !profileId) {
    return (
      <AppCard title="Operational Areas" subtitle="Create a draft profile first." />
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Operational Areas"
        description="The manager’s mental model. Experiences come from the registry — enable, reorder, or move them within this profile."
      />
      {!editable ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This version is {view.workingProfileMeta?.status}. Create a draft to edit Areas and Experiences.
        </p>
      ) : null}

      {profile.areas.map((area) => {
        const orderedIds = area.experiences.map((e) => e.id).join(",");
        return (
          <AppCard
            key={area.id}
            title={area.name}
            subtitle={area.description ?? undefined}
            actions={
              <StatusBadge variant={area.isActive ? "success" : "neutral"}>
                {area.isActive ? "Active" : "Inactive"}
              </StatusBadge>
            }
          >
            <ul className="divide-y divide-zinc-100">
              {area.experiences.map((experience, index) => {
                const canMoveUp = editable && index > 0;
                const canMoveDown = editable && index < area.experiences.length - 1;
                const upOrder = [
                  ...area.experiences.slice(0, index - 1).map((e) => e.id),
                  experience.id,
                  area.experiences[index - 1]?.id,
                  ...area.experiences.slice(index + 1).map((e) => e.id),
                ]
                  .filter(Boolean)
                  .join(",");
                const downOrder = [
                  ...area.experiences.slice(0, index).map((e) => e.id),
                  area.experiences[index + 1]?.id,
                  experience.id,
                  ...area.experiences.slice(index + 2).map((e) => e.id),
                ]
                  .filter(Boolean)
                  .join(",");

                return (
                  <li
                    key={experience.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {experienceDisplayName(experience.experienceKey)}
                      </p>
                      <p className="font-mono text-xs text-zinc-500">
                        {experience.experienceKey}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        variant={experience.isActive ? "success" : "neutral"}
                      >
                        {experience.isActive ? "Enabled" : "Disabled"}
                      </StatusBadge>
                      {editable ? (
                        <>
                          <DepartmentAdminActionForm action={setExperienceActiveAction}>
                            <input type="hidden" name="profileId" value={profileId} />
                            <input
                              type="hidden"
                              name="areaExperienceId"
                              value={experience.id}
                            />
                            <input
                              type="hidden"
                              name="isActive"
                              value={experience.isActive ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                            >
                              {experience.isActive ? "Disable" : "Enable"}
                            </button>
                          </DepartmentAdminActionForm>
                          {canMoveUp ? (
                            <DepartmentAdminActionForm action={reorderExperiencesAction}>
                              <input type="hidden" name="profileId" value={profileId} />
                              <input type="hidden" name="areaId" value={area.id} />
                              <input type="hidden" name="orderedIds" value={upOrder} />
                              <button
                                type="submit"
                                className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                              >
                                Up
                              </button>
                            </DepartmentAdminActionForm>
                          ) : null}
                          {canMoveDown ? (
                            <DepartmentAdminActionForm action={reorderExperiencesAction}>
                              <input type="hidden" name="profileId" value={profileId} />
                              <input type="hidden" name="areaId" value={area.id} />
                              <input type="hidden" name="orderedIds" value={downOrder} />
                              <button
                                type="submit"
                                className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                              >
                                Down
                              </button>
                            </DepartmentAdminActionForm>
                          ) : null}
                          <DepartmentAdminActionForm
                            action={moveExperienceAction}
                            className="inline-flex items-center gap-1"
                          >
                            <input type="hidden" name="profileId" value={profileId} />
                            <input
                              type="hidden"
                              name="areaExperienceId"
                              value={experience.id}
                            />
                            <select
                              name="targetAreaId"
                              defaultValue=""
                              className="rounded border border-zinc-300 px-2 py-1 text-xs"
                              required
                            >
                              <option value="" disabled>
                                Move to…
                              </option>
                              {profile.areas
                                .filter((a) => a.id !== area.id)
                                .map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="submit"
                              className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                            >
                              Move
                            </button>
                          </DepartmentAdminActionForm>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {editable && area.experiences.length > 1 ? (
              <p className="mt-2 text-xs text-zinc-500">
                Current order id list: <span className="font-mono">{orderedIds}</span>
              </p>
            ) : null}
          </AppCard>
        );
      })}
    </div>
  );
}
