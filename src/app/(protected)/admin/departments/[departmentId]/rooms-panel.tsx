import {
  bindRoomAction,
  clearRoomBindingAction,
  upsertRoomExceptionAction,
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

export function RoomsPanel({ view }: Props) {
  const profile = view.workingProfile;
  const editable = view.editable;
  const profileId = view.workingProfileMeta?.id;
  const floorLabel = view.vocabulary.level1.singular;
  const neighborhoodLabel = view.vocabulary.level2.singular;

  if (!profile || !profileId) {
    return <AppCard title="Rooms" subtitle="Create a draft profile first." />;
  }

  const activeArchetypes = profile.archetypes.filter((a) => a.isActive);
  const allExperiences = profile.areas.flatMap((area) =>
    area.experiences.map((experience) => ({
      id: experience.id,
      label: `${experienceDisplayName(experience.experienceKey)} (${area.name})`,
    })),
  );

  const grouped = new Map<string, typeof view.rooms>();
  for (const room of view.rooms) {
    const key = [
      room.floorName ?? `No ${floorLabel}`,
      room.neighborhoodName ?? `No ${neighborhoodLabel}`,
    ].join(" / ");
    const list = grouped.get(key) ?? [];
    list.push(room);
    grouped.set(key, list);
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Rooms"
        description={`Department-assigned rooms from Facility Builder, grouped by ${floorLabel} and ${neighborhoodLabel}. Recommendations are advisory only.`}
      />
      {!editable ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This version is {view.workingProfileMeta?.status}. Create a draft to change room mappings.
        </p>
      ) : null}

      {view.rooms.length === 0 ? (
        <AppCard
          title="No assigned rooms"
          subtitle="Assign this department to rooms in Facility Builder first."
        />
      ) : null}

      {[...grouped.entries()].map(([group, rooms]) => (
        <AppCard key={group} title={group} subtitle={`${rooms.length} room(s)`}>
          <ul className="divide-y divide-zinc-100">
            {rooms.map((room) => (
              <li key={room.unitSpaceId} className="space-y-3 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {room.displayName}
                    </p>
                    <p className="text-xs text-zinc-500">{room.spaceTypeLabel}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {room.binding ? (
                      <StatusBadge variant="success">
                        {room.binding.archetypeName}
                      </StatusBadge>
                    ) : (
                      <StatusBadge variant="warning">Unmapped</StatusBadge>
                    )}
                    {room.recommendedArchetypeKey ? (
                      <span className="text-xs text-zinc-500">
                        Suggested: {room.recommendedArchetypeKey}
                      </span>
                    ) : null}
                    {room.exceptionCount > 0 ? (
                      <StatusBadge variant="in_progress">
                        {room.exceptionCount} exception(s)
                      </StatusBadge>
                    ) : (
                      <span className="text-xs text-zinc-400">Inherited</span>
                    )}
                  </div>
                </div>

                {editable ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <DepartmentAdminActionForm
                      action={bindRoomAction}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="profileId" value={profileId} />
                      <input
                        type="hidden"
                        name="unitSpaceId"
                        value={room.unitSpaceId}
                      />
                      <label className="text-xs font-medium text-zinc-700">
                        Archetype
                        <select
                          name="archetypeId"
                          defaultValue={
                            room.binding?.archetypeId ??
                            activeArchetypes.find(
                              (a) => a.key === room.recommendedArchetypeKey,
                            )?.id ??
                            ""
                          }
                          required
                          className="mt-1 block rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                        >
                          <option value="" disabled>
                            Select…
                          </option>
                          {activeArchetypes.map((archetype) => (
                            <option key={archetype.id} value={archetype.id}>
                              {archetype.name}
                              {archetype.key === room.recommendedArchetypeKey
                                ? " (recommended)"
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                      >
                        Assign
                      </button>
                    </DepartmentAdminActionForm>
                    {room.binding ? (
                      <DepartmentAdminActionForm action={clearRoomBindingAction}>
                        <input type="hidden" name="profileId" value={profileId} />
                        <input
                          type="hidden"
                          name="unitSpaceId"
                          value={room.unitSpaceId}
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                        >
                          Clear
                        </button>
                      </DepartmentAdminActionForm>
                    ) : null}
                  </div>
                ) : null}

                {editable ? (
                  <details className="rounded-md border border-zinc-100 bg-zinc-50 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-zinc-700">
                      Sparse exception
                    </summary>
                    <DepartmentAdminActionForm
                      action={upsertRoomExceptionAction}
                      className="mt-3 grid gap-2 sm:grid-cols-4"
                    >
                      <input type="hidden" name="profileId" value={profileId} />
                      <input
                        type="hidden"
                        name="unitSpaceId"
                        value={room.unitSpaceId}
                      />
                      <label className="text-xs font-medium text-zinc-700 sm:col-span-2">
                        Experience
                        <select
                          name="areaExperienceId"
                          required
                          className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Select…
                          </option>
                          {allExperiences.map((experience) => (
                            <option key={experience.id} value={experience.id}>
                              {experience.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-zinc-700">
                        Mode
                        <select
                          name="mode"
                          defaultValue="ENABLE"
                          className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                        >
                          <option value="ENABLE">Enable</option>
                          <option value="DISABLE">Disable</option>
                          <option value="OVERRIDE">Override</option>
                        </select>
                      </label>
                      <label className="text-xs font-medium text-zinc-700">
                        Reason
                        <input
                          name="reason"
                          className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                        />
                      </label>
                      <div className="sm:col-span-4">
                        <button
                          type="submit"
                          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                        >
                          Save exception
                        </button>
                      </div>
                    </DepartmentAdminActionForm>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </AppCard>
      ))}
    </div>
  );
}
