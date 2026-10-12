import type { ReactNode } from "react";

type WorkspaceShellRailProps = {
  brand: ReactNode;
  workspace?: ReactNode;
  department?: ReactNode;
  destinations: ReactNode;
  mode?: ReactNode;
  compatibility?: ReactNode;
  account?: ReactNode;
};

/**
 * Presentational desktop rail. Callers pass already-resolved chrome.
 * Does not authorize or switch sessions.
 */
export function WorkspaceShellRail({
  brand,
  workspace,
  department,
  destinations,
  mode,
  compatibility,
  account,
}: WorkspaceShellRailProps) {
  return (
    <aside
      className="hidden w-72 shrink-0 flex-col overflow-y-auto border-r border-zinc-200 bg-white xl:flex xl:min-h-0"
      aria-label="Workspace"
      data-testid="workspace-shell-rail"
      data-shell-region="sidebar"
    >
      <div className="flex flex-col gap-3 px-4 pb-3 pt-4">
        {brand}
        {workspace}
        {department}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">{destinations}</div>
      {mode ? <div className="border-t border-zinc-200 px-2 py-3">{mode}</div> : null}
      {compatibility ? (
        <div
          className="border-t border-zinc-200 px-3 py-2"
          data-testid="shell-compatibility-switcher"
        >
          {compatibility}
        </div>
      ) : null}
      {account ? <div className="border-t border-zinc-200 p-3">{account}</div> : null}
    </aside>
  );
}
