"use client";

import { useMemo, useState } from "react";

import { setArchetypeExperiencesAction } from "@/app/(protected)/admin/departments/[departmentId]/actions";
import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";

type ExperienceOption = {
  id: string;
  label: string;
  selected: boolean;
};

export function ArchetypeExperiencePicker({
  profileId,
  archetypeId,
  experiences,
}: {
  profileId: string;
  archetypeId: string;
  experiences: ExperienceOption[];
}) {
  const [selected, setSelected] = useState(() =>
    new Set(experiences.filter((e) => e.selected).map((e) => e.id)),
  );

  const selectedIds = useMemo(() => [...selected].join(","), [selected]);

  return (
    <DepartmentAdminActionForm action={setArchetypeExperiencesAction}>
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="archetypeId" value={archetypeId} />
      <input type="hidden" name="selectedIds" value={selectedIds} />
      <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto rounded-md border border-zinc-100 p-2">
        {experiences.map((experience) => (
          <li key={experience.id}>
            <label className="flex items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={selected.has(experience.id)}
                onChange={(event) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (event.target.checked) next.add(experience.id);
                    else next.delete(experience.id);
                    return next;
                  });
                }}
                className="rounded border-zinc-300"
              />
              <span>{experience.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <button
        type="submit"
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
      >
        Save Experiences
      </button>
    </DepartmentAdminActionForm>
  );
}
