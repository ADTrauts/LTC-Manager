import type { CurrentContextPresentation } from "@/lib/available-contexts/current-presentation";

type CurrentWorkspaceRegionProps = {
  current: CurrentContextPresentation | null;
  compact?: boolean;
  /** When false, the parent trigger owns the accessible name. */
  announce?: boolean;
};

/**
 * Closed current-workspace chrome. Interactive switching lives in WorkspaceSelector.
 * Omit entirely for PIN / sessions with no User workspace.
 */
export function CurrentWorkspaceRegion({
  current,
  compact = false,
  announce = true,
}: CurrentWorkspaceRegionProps) {
  if (!current) return null;

  return (
    <div
      data-testid="current-workspace-region"
      data-workspace-slot="reserved"
      aria-label={announce ? `Current workspace: ${current.title}. ${current.subtitle}` : undefined}
      className={compact ? "min-w-0 max-w-[11rem] sm:max-w-[14rem] xl:max-w-[22rem]" : "min-w-0"}
    >
      <p className="truncate text-sm font-semibold leading-snug text-zinc-900">{current.title}</p>
      <p className="truncate text-xs leading-snug text-zinc-600">{current.subtitle}</p>
    </div>
  );
}
