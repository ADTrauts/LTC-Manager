/**
 * Wave 16A — shared placeholder / state chrome for Experience Shell.
 */

export function ShellLoadingState({ label }: { label: string }) {
  return (
    <div
      className="animate-pulse space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      role="status"
      data-testid="experience-shell-loading"
      aria-label={`Loading ${label}`}
    >
      <div className="h-4 w-1/3 rounded bg-zinc-200" />
      <div className="h-3 w-2/3 rounded bg-zinc-100" />
      <div className="h-16 rounded bg-zinc-50" />
    </div>
  );
}

export function ShellUnavailableState({
  label,
  reason,
}: {
  label: string;
  reason: string;
}) {
  return (
    <div
      className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm"
      role="status"
      data-testid="experience-shell-unavailable"
    >
      <p className="font-semibold text-zinc-900">{label}</p>
      <p className="mt-1">{reason}</p>
    </div>
  );
}

export function ShellEmptyState({ label }: { label: string }) {
  return (
    <div
      className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600"
      role="status"
      data-testid="experience-shell-empty"
    >
      <p className="font-medium text-zinc-800">{label}</p>
      <p className="mt-1">
        No sections are available for this Experience at the current density.
      </p>
    </div>
  );
}

export function UnknownComponentPlaceholder({
  kind,
}: {
  kind: string;
}) {
  return (
    <div
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
      role="status"
      data-testid="experience-shell-unknown-component"
      data-component-kind={kind}
    >
      Unknown component <span className="font-mono">{kind}</span> — safe
      placeholder.
    </div>
  );
}

export function ExperienceBodyPlaceholder({
  experienceKey,
}: {
  experienceKey: string;
}) {
  return (
    <p
      className="text-xs text-zinc-500"
      data-testid="experience-shell-body-placeholder"
      data-experience-key={experienceKey}
    >
      Experience body for <span className="font-mono">{experienceKey}</span>{" "}
      attaches in a later wave. Sections, cards, widgets, and tools below are
      contract-driven chrome.
    </p>
  );
}
