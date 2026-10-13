import type { ReactNode } from "react";

type WorkspaceShellRailProps = {
  department?: ReactNode;
  destinations: ReactNode;
  compatibility?: ReactNode;
};

/**
 * Presentational desktop rail. Destinations for the active Workspace + Mode.
 * Global brand, Workspace, Mode, and account live in the top bar.
 */
export function WorkspaceShellRail({
  department,
  destinations,
  compatibility,
}: WorkspaceShellRailProps) {
  return (
    <aside
      className="hidden w-72 shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white xl:flex xl:min-h-0"
      aria-label="Workspace navigation"
      data-testid="workspace-shell-rail"
      data-shell-region="sidebar"
    >
      {department ? (
        <div className="shrink-0 px-4 pb-2 pt-4" data-testid="workspace-rail-department">
          {department}
        </div>
      ) : null}
      <div className={`min-h-0 flex-1 overflow-y-auto px-2 pb-4 ${department ? "" : "pt-3"}`}>
        {destinations}
      </div>
      {compatibility ? (
        <div
          className="shrink-0 border-t border-zinc-200 px-3 py-2"
          data-testid="shell-compatibility-switcher"
        >
          {compatibility}
        </div>
      ) : null}
    </aside>
  );
}
