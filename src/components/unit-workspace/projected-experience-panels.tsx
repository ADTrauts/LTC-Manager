import { ExperienceShell } from "@/components/experience-shell";
import { isExperienceShellEnabled } from "@/lib/feature-flags";
import type {
  UnitWorkspaceExperiencePanel,
  UnitWorkspaceProjectionView,
} from "@/lib/unit-workspace/projection";

type ProjectedUnitWorkspaceBodyProps = {
  view: UnitWorkspaceProjectionView;
  unitName: string;
};

function LegacyExperiencePlaceholder({
  experience,
}: {
  experience: UnitWorkspaceExperiencePanel;
}) {
  return (
    <article
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      data-testid="projected-experience-panel"
      data-experience-key={experience.experienceKey}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-zinc-900">
            {experience.label}
          </h4>
          <p className="mt-1 text-sm text-zinc-600">{experience.description}</p>
        </div>
        {experience.statusKeys.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {experience.statusKeys.map((key) => (
              <span
                key={key}
                className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600"
              >
                {key.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {experience.tools.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
            Tools
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {experience.tools.map((tool) => (
              <li
                key={tool.key}
                className="rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-800"
                title={tool.description}
                data-tool-key={tool.key}
              >
                {tool.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {experience.actions.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
            Actions
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {experience.actions.map((action) => (
              <li key={action.key}>
                <span
                  className="inline-flex min-h-9 items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800"
                  data-action-key={action.key}
                >
                  {action.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-zinc-500">
        Runtime body for this Experience will attach in a later wave. Density:{" "}
        {experience.density}.
      </p>
    </article>
  );
}

function ShellExperiencePanel({
  experience,
}: {
  experience: UnitWorkspaceExperiencePanel;
}) {
  return (
    <ExperienceShell
      experienceKey={experience.experienceKey}
      label={experience.label}
      description={experience.description}
      density={experience.density}
      allowedActionKeys={experience.allowedActionKeys}
      actions={experience.actions}
      statusKeys={experience.statusKeys}
      home="unitWorkspace"
    />
  );
}

export function ProjectedUnitWorkspaceBody({
  view,
  unitName,
}: ProjectedUnitWorkspaceBodyProps) {
  if (view.error && !view.unitIncluded) {
    return (
      <div
        className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm"
        role="status"
        data-testid="unit-workspace-projection-unavailable"
      >
        <p className="font-semibold text-zinc-900">Workspace unavailable</p>
        <p className="mt-1">{view.error}</p>
      </div>
    );
  }

  const hasAreas = view.sections.some((s) => s.areas.length > 0);
  const useShell = isExperienceShellEnabled();

  return (
    <div className="space-y-6 sm:space-y-7" data-testid="unit-workspace-projection">
      {view.roomContext.length > 0 ? (
        <section aria-label={`${view.level3Label} context`} className="space-y-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
            {view.level3Label}s at {unitName}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {view.roomContext.map((room) => (
              <li
                key={room.spaceId}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700"
                data-presentation={room.presentation}
              >
                {room.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!hasAreas ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
          No operational Experiences are projected for this location under the
          active department.
        </p>
      ) : null}

      {view.sections.map((section, sectionIndex) => (
        <div
          key={section.departmentKey ?? `section-${sectionIndex}`}
          className="space-y-5"
        >
          {section.label ? (
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
              {section.label}
            </h2>
          ) : null}

          {section.areas.map((area) => (
            <section
              key={area.areaKey}
              className="space-y-3"
              aria-label={area.label}
              data-area-key={area.areaKey}
            >
              <header className="border-b border-zinc-200 pb-2">
                <h3 className="text-lg font-semibold tracking-tight text-zinc-900">
                  {area.label}
                </h3>
              </header>

              <div className="space-y-3">
                {area.experiences.map((experience) =>
                  useShell ? (
                    <ShellExperiencePanel
                      key={experience.id}
                      experience={experience}
                    />
                  ) : (
                    <LegacyExperiencePlaceholder
                      key={experience.id}
                      experience={experience}
                    />
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}
