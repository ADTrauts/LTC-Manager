import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ShellBrandBlock } from "@/components/shell-brand-block";
import { ShellModeCue } from "@/components/shell-mode-cue";
import { ShellModeFrame } from "@/components/shell-mode-frame";
import { WorkspaceSelector } from "@/components/shell/workspace-selector";
import { WorkspaceShellHeader } from "@/components/shell/workspace-shell-header";
import { AccountMenu } from "@/components/sign-out-controls";
import { hasAtLeastRole } from "@/lib/access";
import {
  loadWorkspaceSelectorModel,
  presentCurrentContextFromSession,
} from "@/lib/available-contexts";
import {
  getAppSession,
  isFacilityScopedSession,
} from "@/lib/auth";
import {
  isCanonicalLogsEnabled,
  isDietaryOperationalEvidenceEnabled,
  isDietaryWorkPlansEnabled,
  isTodaysWorkEnabled,
} from "@/lib/feature-flags";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { roleMayAccessRoute } from "@/lib/route-registry";
import {
  resolveWorkspaceHomeHref,
  workspaceHomeBackLabel,
} from "@/lib/shell/workspace-home";

/**
 * Identity surfaces (My Access, My Account) keep the global header:
 * Vssyl, Workspace, Mode when applicable, and the account menu.
 * My Access and My Account are account-menu destinations, not a second top bar.
 */
export async function GlobalUserLayout({ children }: { children: ReactNode }) {
  const session = await getAppSession();
  if (!session || session.authKind !== "user") {
    redirect("/login");
  }

  const workspaceSelector = await loadWorkspaceSelectorModel(session);
  const directoryCurrent = workspaceSelector?.items.find(
    (item) => item.contextKey === workspaceSelector.currentContextKey,
  );
  const currentWorkspace = directoryCurrent
    ? { title: directoryCurrent.title, subtitle: directoryCurrent.subtitle }
    : presentCurrentContextFromSession(session);

  const homeHref = resolveWorkspaceHomeHref(session);
  const backLabel = workspaceHomeBackLabel(session);
  const facilitySession = isFacilityScopedSession(session) ? session : null;
  const navFeatureFlags = {
    todaysWorkEnabled: isTodaysWorkEnabled(),
    dietaryOperationalEvidenceEnabled: isDietaryOperationalEvidenceEnabled(),
    dietaryWorkPlansEnabled: isDietaryWorkPlansEnabled(),
    canonicalLogsEnabled: isCanonicalLogsEnabled(),
  };
  const runHomeHref = facilitySession
    ? resolveDefaultHomePath({
        authKind: session.authKind,
        role: facilitySession.role,
        activeUnitId: session.activeUnitId,
      })
    : undefined;
  const showBuild = Boolean(
    facilitySession && roleMayAccessRoute("/build", facilitySession.role, navFeatureFlags),
  );
  const showAdmin = Boolean(
    facilitySession && roleMayAccessRoute("/admin", facilitySession.role, navFeatureFlags),
  );

  return (
    <ShellModeFrame brandColor="#0f766e">
      <WorkspaceShellHeader
        brand={<ShellBrandBlock href={homeHref} />}
        workspace={
          workspaceSelector ? (
            <WorkspaceSelector
              current={currentWorkspace}
              currentContextKey={workspaceSelector.currentContextKey}
              items={workspaceSelector.items}
            />
          ) : null
        }
        mode={
          runHomeHref ? (
            <ShellModeCue runHomeHref={runHomeHref} showBuild={showBuild} showAdmin={showAdmin} />
          ) : null
        }
        account={
          <AccountMenu
            showUnbind={Boolean(
              facilitySession && hasAtLeastRole(facilitySession.role, "FACILITY_ADMINISTRATOR"),
            )}
            showMyAccess
            menuLabel={session.name}
            compactTrigger
          />
        }
      />
      <div data-shell-main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {backLabel ? (
          <div className="mx-auto max-w-3xl px-4 pt-6 -mb-4">
            <Link
              href={homeHref}
              data-testid="back-to-workspace"
              className={`text-sm font-medium text-zinc-700 underline underline-offset-2 ${FOCUS_RING_CLASS}`}
            >
              {backLabel}
            </Link>
          </div>
        ) : null}
        {children}
      </div>
    </ShellModeFrame>
  );
}
