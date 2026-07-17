/**
 * Wave 16A — Universal Experience Shell.
 *
 * Header · Status · Description · Actions · Sections · Tools · Placeholders.
 * Everything generic. Nothing Experience-specific.
 */

import {
  resolveExperienceShellModel,
  type ExperienceRuntimeOverlay,
  type ExperienceShellModel,
  type ResolveExperienceShellInput,
} from "@/lib/experience-shell";

import { SectionRenderer } from "./section-renderer";
import {
  ExperienceBodyPlaceholder,
  ShellEmptyState,
  ShellLoadingState,
  ShellUnavailableState,
} from "./placeholders";

export type ExperienceShellProps = ResolveExperienceShellInput & {
  /** Pre-resolved model (tests / advanced callers). */
  model?: ExperienceShellModel;
  className?: string;
};

export function ExperienceShell(props: ExperienceShellProps) {
  const model =
    props.model ??
    resolveExperienceShellModel({
      experienceKey: props.experienceKey,
      label: props.label,
      description: props.description,
      density: props.density,
      allowedActionKeys: props.allowedActionKeys,
      actions: props.actions,
      statusKeys: props.statusKeys,
      home: props.home,
      overlay: props.overlay,
      state: props.state,
    });

  if (model.state === "loading") {
    return <ShellLoadingState label={model.label} />;
  }

  if (model.state === "unavailable") {
    return (
      <ShellUnavailableState
        label={model.label}
        reason={model.unavailableReason ?? "Experience unavailable"}
      />
    );
  }

  if (model.state === "empty") {
    return <ShellEmptyState label={model.label} />;
  }

  return (
    <article
      className={
        props.className ??
        "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      }
      data-testid="experience-shell"
      data-experience-key={model.experienceKey}
      data-density={model.density}
      data-shell-state={model.state}
    >
      <header className="space-y-2" data-testid="experience-shell-header">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-base font-semibold text-zinc-900">
              {model.label}
            </h4>
            {model.description ? (
              <p className="mt-1 text-sm text-zinc-600">{model.description}</p>
            ) : null}
          </div>
          {model.statusKeys.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {model.statusKeys.map((key) => (
                <span
                  key={key}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600"
                  data-status-key={key}
                >
                  {key.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {model.headerActions.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {model.headerActions.map((action) => (
              <li key={action.key}>
                <span
                  className="inline-flex min-h-9 items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800"
                  data-action-key={action.key}
                  data-placement="HEADER"
                >
                  {action.label}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {model.bodyIsPlaceholder ? (
        <div className="mt-3">
          <ExperienceBodyPlaceholder experienceKey={model.experienceKey} />
        </div>
      ) : null}

      <div className="mt-4 space-y-4" data-testid="experience-shell-sections">
        {model.sections.map((section) => (
          <SectionRenderer key={section.key} section={section} />
        ))}
      </div>
    </article>
  );
}

export type { ExperienceRuntimeOverlay, ExperienceShellModel };
