import type { CurrentContextPresentation } from "@/lib/available-contexts";

type CurrentWorkspaceRegionProps = {
  current: CurrentContextPresentation | null;
  compact?: boolean;
};

/**
 * Reserved shell slot for the active operating workspace.
 * Display-only. The next ACT replaces this with Switch workspace.
 * Omit entirely for PIN / sessions with no User workspace.
 */
export function CurrentWorkspaceRegion({
  current,
  compact = false,
}: CurrentWorkspaceRegionProps) {
  if (!current) return null;

  return (
    <div
      data-testid="current-workspace-region"
      data-workspace-slot="reserved"
      aria-label={`Current workspace: ${current.title}. ${current.subtitle}`}
      className={compact ? "min-w-0 max-w-[11rem] sm:max-w-[14rem]" : "min-w-0"}
    >
      {compact ? null : (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Workspace
        </p>
      )}
      <p className="truncate text-sm font-semibold leading-snug text-zinc-900">{current.title}</p>
      <p className="truncate text-xs leading-snug text-zinc-600">{current.subtitle}</p>
    </div>
  );
}
