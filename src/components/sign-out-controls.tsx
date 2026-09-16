"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { OPEN_ACCOUNT_MENU_EVENT } from "@/components/shell-mode-cue";
import { AppIcons } from "@/lib/design-system";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
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

const MENU_ITEM_CLASS = `block w-full px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50 ${FOCUS_RING_CLASS}`;

const SECTION_HEADING_CLASS =
  "px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400";

function WorkspaceLink({
  href,
  label,
  mode,
  activeMode,
  testId,
  onNavigate,
}: {
  href: string;
  label: string;
  mode: ProductMode;
  activeMode: ProductMode;
  testId: string;
  onNavigate: () => void;
}) {
  const isActive = mode === activeMode;
  const hasModeAccent = mode === "BUILD" || mode === "RUN";
  const activeClass =
    mode === "BUILD"
      ? "bg-orange-500 text-white hover:bg-orange-500"
      : mode === "RUN"
        ? "bg-emerald-700 text-white hover:bg-emerald-700"
        : "bg-zinc-100 text-zinc-900";
  return (
    <Link
      href={href}
      className={`flex items-center justify-between ${MENU_ITEM_CLASS} ${isActive ? activeClass : ""}`}
      data-testid={testId}
      data-mode={mode}
      data-mode-active={isActive ? "true" : undefined}
      aria-current={isActive ? "true" : undefined}
      onClick={onNavigate}
    >
      <span className="inline-flex items-center gap-2">
        {isActive ? (
          <span className={hasModeAccent ? "text-white/80" : "text-zinc-500"} aria-hidden>
            ✓
          </span>
        ) : (
          <span className="inline-block w-3" aria-hidden />
        )}
        {label}
      </span>
      {isActive ? (
        <span
          className={`text-[11px] font-semibold uppercase tracking-wide ${
            hasModeAccent ? "text-white/80" : "text-zinc-400"
          }`}
        >
          Current
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Context / user menu — workspace switching, governance, and account actions.
 * Destructive device unbind is visually demoted below ordinary account actions.
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
  const [open, setOpen] = useState(false);
  const UserIcon = AppIcons.user;
  const SignOutIcon = AppIcons.signOut;

  const showWorkspaceGroup = showBuild;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      const target = event.target;
      if (target instanceof Node && root.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    function onOpenRequest() {
      setOpen(true);
    }
    window.addEventListener(OPEN_ACCOUNT_MENU_EVENT, onOpenRequest);
    return () => window.removeEventListener(OPEN_ACCOUNT_MENU_EVENT, onOpenRequest);
  }, []);

  return (
    <details
      ref={rootRef}
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
      className="group relative flex"
      data-testid="account-menu"
    >
      <summary
        data-testid="account-menu-trigger"
        className={`flex min-h-10 max-w-[10rem] cursor-pointer list-none items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 ${FOCUS_RING_CLASS} [&::-webkit-details-marker]:hidden sm:px-3`}
        aria-label={`Workspace and account menu for ${menuLabel}`}
        title={menuLabel}
      >
        <UserIcon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <span className="hidden truncate lg:inline">{menuLabel}</span>
        <AppIcons.chevronDown className="hidden h-4 w-4 shrink-0 opacity-70 sm:inline" aria-hidden />
      </summary>
      <div
        className="absolute right-0 top-full z-50 mt-1 max-w-[calc(100vw-1.5rem)] min-w-[15rem] rounded-md border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
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
              onNavigate={() => setOpen(false)}
            />
            <WorkspaceLink
              href="/build"
              label="Build"
              mode="BUILD"
              activeMode={activeMode}
              testId="account-menu-build"
              onNavigate={() => setOpen(false)}
            />
            {showAdmin ? (
              <WorkspaceLink
                href="/admin"
                label="Admin"
                mode="ADMIN"
                activeMode={activeMode}
                testId="account-menu-admin"
                onNavigate={() => setOpen(false)}
              />
            ) : null}
          </div>
        ) : showAdmin ? (
          <div data-testid="account-menu-admin-group">
            <p className={SECTION_HEADING_CLASS}>Workspace</p>
            <WorkspaceLink
              href="/admin"
              label="Admin"
              mode="ADMIN"
              activeMode={activeMode}
              testId="account-menu-admin"
              onNavigate={() => setOpen(false)}
            />
          </div>
        ) : null}

        <div>
          {showWorkspaceGroup || showAdmin ? (
            <>
              <div className="mx-3 my-1 border-t border-zinc-100" role="separator" />
              <p className={SECTION_HEADING_CLASS}>Account</p>
            </>
          ) : null}
          {showChangePassword ? (
            <Link
              href="/account"
              className={MENU_ITEM_CLASS}
              data-testid="account-menu-change-password"
              onClick={() => setOpen(false)}
            >
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
            <form
              action="/api/auth/logout-full"
              method="post"
              onSubmit={(e) => {
                if (
                  !window.confirm(
                    "Sign out and unbind this device? This clears the facility binding and unit lock on this browser.",
                  )
                ) {
                  e.preventDefault();
                  return;
                }
                void prepareFullSignOut(e);
              }}
            >
              <button
                type="submit"
                className={`mt-1 block w-full border-t border-zinc-100 px-3 py-2.5 text-left text-xs font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 ${FOCUS_RING_CLASS}`}
                data-testid="account-menu-unbind"
                title="Clears session, facility binding, and unit lock on this browser"
              >
                Unbind this device
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </details>
  );
}
