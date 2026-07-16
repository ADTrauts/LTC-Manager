import {
  createArchetypeAction,
  updateArchetypeAction,
} from "@/app/(protected)/admin/departments/[departmentId]/actions";
import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import { ArchetypeExperiencePicker } from "@/app/(protected)/admin/departments/[departmentId]/archetype-experience-picker";
import { AppCard, SectionHeader, StatusBadge } from "@/components/design-system";
import {
  experienceDisplayName,
  type DepartmentAdminView,
} from "@/lib/department-administration";

type Props = {
  view: DepartmentAdminView;
};

export function ArchetypesPanel({ view }: Props) {
  const profile = view.workingProfile;
  const editable = view.editable;
  const profileId = view.workingProfileMeta?.id;

  if (!profile || !profileId) {
    return (
      <AppCard title="Room Archetypes" subtitle="Create a draft profile first." />
    );
  }

  const allExperiences = profile.areas.flatMap((area) =>
    area.experiences.map((experience) => ({
      ...experience,
      areaName: area.name,
    })),
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Room Archetypes"
        description="Operational templates for categories of room. Physical rooms are mapped on the Rooms tab."
      />
      {!editable ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This version is {view.workingProfileMeta?.status}. Create a draft to edit archetypes.
        </p>
      ) : null}

      {editable ? (
        <AppCard title="Create archetype">
          <DepartmentAdminActionForm
            action={createArchetypeAction}
            className="grid gap-3 sm:grid-cols-3"
          >
            <input type="hidden" name="profileId" value={profileId} />
            <label className="text-xs font-medium text-zinc-700">
              Key
              <input
                name="key"
                required
                placeholder="servery"
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-zinc-700">
              Name
              <input
                name="name"
                required
                placeholder="Servery"
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-zinc-700">
              Description
              <input
                name="description"
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <div className="sm:col-span-3">
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Create
              </button>
            </div>
          </DepartmentAdminActionForm>
        </AppCard>
      ) : null}

      {profile.archetypes.map((archetype) => {
        const selected = new Set(
          archetype.experiences.map((e) => e.areaExperienceId),
        );
        return (
          <AppCard
            key={archetype.id}
            title={archetype.name}
            subtitle={archetype.description ?? `Key: ${archetype.key}`}
            actions={
              <StatusBadge variant={archetype.isActive ? "success" : "neutral"}>
                {archetype.isActive ? "Active" : "Inactive"}
              </StatusBadge>
            }
          >
            {editable ? (
              <div className="mb-4 space-y-3 border-b border-zinc-100 pb-4">
                <DepartmentAdminActionForm
                  action={updateArchetypeAction}
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="profileId" value={profileId} />
                  <input type="hidden" name="archetypeId" value={archetype.id} />
                  <label className="text-xs font-medium text-zinc-700">
                    Name
                    <input
                      name="name"
                      defaultValue={archetype.name}
                      className="mt-1 block rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs font-medium text-zinc-700">
                    Description
                    <input
                      name="description"
                      defaultValue={archetype.description ?? ""}
                      className="mt-1 block min-w-[16rem] rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                  >
                    Save
                  </button>
                </DepartmentAdminActionForm>
                <DepartmentAdminActionForm action={updateArchetypeAction}>
                  <input type="hidden" name="profileId" value={profileId} />
                  <input type="hidden" name="archetypeId" value={archetype.id} />
                  <input
                    type="hidden"
                    name="isActive"
                    value={archetype.isActive ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                  >
                    {archetype.isActive ? "Deactivate" : "Activate"}
                  </button>
                </DepartmentAdminActionForm>
              </div>
            ) : null}

            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Experiences
            </p>
            {editable ? (
              <ArchetypeExperiencePicker
                profileId={profileId}
                archetypeId={archetype.id}
                experiences={allExperiences.map((e) => ({
                  id: e.id,
                  label: `${experienceDisplayName(e.experienceKey)} (${e.areaName})`,
                  selected: selected.has(e.id),
                }))}
              />
            ) : (
              <ul className="space-y-1 text-sm text-zinc-700">
                {archetype.experiences.map((selection) => {
                  const experience = allExperiences.find(
                    (e) => e.id === selection.areaExperienceId,
                  );
                  return (
                    <li key={selection.id}>
                      {experience
                        ? experienceDisplayName(experience.experienceKey)
                        : selection.areaExperienceId}
                      {!selection.isActive ? " (inactive)" : ""}
                    </li>
                  );
                })}
              </ul>
            )}
          </AppCard>
        );
      })}
    </div>
  );
}
