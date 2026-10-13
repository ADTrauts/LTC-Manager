import type { ReactNode } from "react";

import { shellClasses } from "@/lib/design-system";

type WorkspaceShellHeaderProps = {
  menu?: ReactNode;
  brand: ReactNode;
  workspace?: ReactNode;
  mode?: ReactNode;
  trailing?: ReactNode;
  account?: ReactNode;
};

/**
 * Persistent global bar. Owns product brand, Workspace, Mode, and identity.
 * Destinations stay in the workspace rail / compact Menu.
 */
export function WorkspaceShellHeader({
  menu,
  brand,
  workspace,
  mode,
  trailing,
  account,
}: WorkspaceShellHeaderProps) {
  return (
    <header
      className="shell-header shrink-0 border-b border-zinc-200 bg-white"
      role="banner"
      data-shell-region="header"
      data-testid="workspace-shell-header"
    >
      <div
        className={`mx-auto flex w-full min-w-0 ${shellClasses.maxWidth} flex-nowrap items-center gap-1.5 overflow-x-clip px-3 py-1.5 sm:gap-2 sm:px-4 sm:py-2`}
      >
        {menu}
        {brand}
        {workspace ? (
          <>
            <div className="hidden h-6 w-px shrink-0 bg-zinc-200 xl:block" aria-hidden />
            <div className="min-w-0 flex-1" data-testid="workspace-header-slot">
              <div className="w-fit max-w-full">{workspace}</div>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {mode ? <div className="hidden xl:flex">{mode}</div> : null}
          {trailing}
          {account}
        </div>
      </div>
    </header>
  );
}
