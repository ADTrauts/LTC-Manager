"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type FormEvent } from "react";

import { AppIcons } from "@/lib/design-system";
import { clearAllOfflineData, clearForSignOut } from "@/lib/offline/local-store";
import { resolveProductModeForPath, type ProductMode } from "@/lib/product-mode";

type AccountMenuProps = {
  showUnbind: boolean;
  showChangePassword?: boolean;
  /** Display label for the menu trigger (user/context label — no longer just "Account"). */
  menuLabel?: string;
  /** Canonical RUN home for this session (managers → Dashboard, supervisors → Today's Work, …). */
  runHomeHref?: string;
  /** Whether this session may reach BUILD (Build Home). Presentation only — never grants authority. */
  showBuild?: boolean;
  /** Whether this session may reach ADMIN governance. Presentation only — never grants authority. */
  showAdmin?: boolean;
};

async function postLogoutAndRedirect(form: HTMLFormElement) {
  const action = form.getAttribute("action") || "/api/auth/logout";
  try {
    await fetch(action, {
      method: "POST",
      credentials: "same-origin",
      redirect: "manual",
    });
  } catch {
    // Continue to login even if the network blips after local clearance.
  }
  window.location.assign("/login");
}

async function prepareStandardSignOut(event: FormEvent<HTMLFormElement>) {
  // Clear the active operational bundle before the session cookie is removed so the next
  // shared-tablet user cannot see prior workspace state from IndexedDB.
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await clearForSignOut();
  } catch {
    // Best-effort: still sign out even if IndexedDB is unavailable.
  }
  await postLogoutAndRedirect(form);
}

async function prepareFullSignOut(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await clearAllOfflineData();
  } catch {
    // Best-effort.
  }
  await postLogoutAndRedirect(form);
}

const MENU_ITEM_CLASS =
  "block w-full px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400";

const SECTION_HEADING_CLASS =
  "px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400";

function WorkspaceLink({
  href,
  label,
  mode,
  activeMode,
  testId,
}: {
  href: string;
  label: string;
  mode: ProductMode;
  activeMode: ProductMode;
  testId: string;
}) {
  const isActive = mode === activeMode;
  const isBuild = mode === "BUILD";
  const activeClass = isBuild
    ? "bg-amber-50 text-amber-900"
    : "bg-zinc-100 text-zinc-900";
  return (
    <Link
      href={href}
      className={`flex items-center justify-between ${MENU_ITEM_CLASS} ${isActive ? activeClass : ""}`}
      data-testid={testId}
      data-mode={mode}
      data-mode-active={isActive ? "true" : undefined}
      aria-current={isActive ? "true" : undefined}
    >
      <span>{label}</span>
      {isActive ? (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Current
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Context / user menu — the single right-aligned entry point for workspace switching, governance,
 * and account actions.
 *
 * Workspace (Run / Build) and Administration (Admin) live here rather than as permanent top-bar
 * controls, keeping the global header focused on the current workspace's destinations. Every entry
 * is presentation only: it is offered when the platform route registry already permits the session
 * to reach that surface, and it never grants authority. Change password / Sign out remain here.
 * Sign-out still clears the offline bundle before the session cookie is removed (shared-tablet
 * safety); Facility Administrators additionally get "Sign out & unbind device".
 */
export function AccountMenu({
  showUnbind,
  showChangePassword = false,
  menuLabel = "Menu",
  runHomeHref = "/workspace",
  showBuild = false,
  showAdmin = false,
}: AccountMenuProps) {
  const pathname = usePathname();
  const activeMode = resolveProductModeForPath(pathname ?? "/");
  const rootRef = useRef<HTMLDetailsElement>(null);
  const UserIcon = AppIcons.user;
  const SignOutIcon = AppIcons.signOut;

  // A "Run" switch entry is only meaningful when another workspace (Build) exists to switch back
  // from — a Run-only frontline session gets no pointless Run entry.
  const showWorkspaceGroup = showBuild;

  // Native <details> stays open on outside clicks; dismiss on outside pointer, Escape, and route change.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function close() {
      root?.removeAttribute("open");
    }

    close();

    function onPointerDown(event: PointerEvent) {
      if (!root?.open) return;
      const target = event.target;
      if (target instanceof Node && root.contains(target)) return;
      close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !root?.open) return;
      close();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pathname]);

  return (
    <details ref={rootRef} className="group relative flex" data-testid="account-menu">
      <summary
        data-testid="account-menu-trigger"
        className="flex min-h-10 max-w-[10rem] cursor-pointer list-none items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 [&::-webkit-details-marker]:hidden sm:px-3"
        aria-label="Workspace and account menu"
        title={menuLabel}
      >
        <UserIcon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <span className="hidden truncate sm:inline">{menuLabel}</span>
        <AppIcons.chevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      </summary>
      <div
        className="absolute right-0 top-full z-50 mt-1 min-w-[15rem] rounded-md border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
        data-testid="account-menu-panel"
      >
        {showWorkspaceGroup ? (
          <div data-testid="account-menu-workspace-group">
            <p className={SECTION_HEADING_CLASS}>Workspace</p>
            <WorkspaceLink
              href={runHomeHref}
              label="Run"
              mode="RUN"
              activeMode={activeMode}
              testId="account-menu-run"
            />
            <WorkspaceLink
              href="/build"
              label="Build"
              mode="BUILD"
              activeMode={activeMode}
              testId="account-menu-build"
            />
          </div>
        ) : null}

        {showAdmin ? (
          <div data-testid="account-menu-admin-group">
            <p className={SECTION_HEADING_CLASS}>Administration</p>
            <WorkspaceLink
              href="/admin"
              label="Admin"
              mode="ADMIN"
              activeMode={activeMode}
              testId="account-menu-admin"
            />
          </div>
        ) : null}

        <div>
          {showWorkspaceGroup || showAdmin ? (
            <p className={SECTION_HEADING_CLASS}>Account</p>
          ) : null}
          {showChangePassword ? (
            <Link href="/account" className={MENU_ITEM_CLASS} data-testid="account-menu-change-password">
              Change password
            </Link>
          ) : null}
          <form action="/api/auth/logout" method="post" onSubmit={(e) => void prepareStandardSignOut(e)}>
            <button type="submit" className={MENU_ITEM_CLASS} data-testid="account-menu-sign-out">
              <span className="inline-flex items-center gap-2">
                <SignOutIcon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                Sign out
              </span>
            </button>
          </form>
          {showUnbind ? (
            <form action="/api/auth/logout-full" method="post" onSubmit={(e) => void prepareFullSignOut(e)}>
              <button
                type="submit"
                className="block w-full px-3 py-2 text-left text-sm font-medium text-amber-900 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
                data-testid="account-menu-unbind"
                title="Clears session, facility binding, and unit lock on this browser"
              >
                Sign out &amp; unbind device
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </details>
  );
}
