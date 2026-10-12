"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { GlobalUserNavLinks } from "@/components/global-user-menu";
import { CUSTOMER_SUPPORT_HREF } from "@/lib/customer-support";
import { AppIcons } from "@/lib/design-system";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import { clearAllOfflineData, clearForSignOut } from "@/lib/offline/local-store";

type AccountMenuProps = {
  showUnbind: boolean;
  /** Display label for the menu trigger. */
  menuLabel?: string;
  /** User-authenticated sessions only. PIN must not see My Access. */
  showMyAccess?: boolean;
  /** Compact header: avatar only. Rail: include the name. */
  compactTrigger?: boolean;
  /** Rail account sits at the bottom — open upward. */
  menuAlign?: "down" | "up";
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

/**
 * Identity / account menu. Mode switching lives in ShellModeNav.
 * Destructive device unbind is visually demoted below ordinary account actions.
 */
export function AccountMenu({
  showUnbind,
  menuLabel = "Menu",
  showMyAccess = false,
  compactTrigger = false,
  menuAlign = "down",
}: AccountMenuProps) {
  const rootRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const UserIcon = AppIcons.user;
  const SignOutIcon = AppIcons.signOut;

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
        className={`flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 ${FOCUS_RING_CLASS} [&::-webkit-details-marker]:hidden sm:px-3`}
        aria-label={`Account menu for ${menuLabel}`}
        title={menuLabel}
      >
        <UserIcon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        {compactTrigger ? (
          <span className="sr-only">{menuLabel}</span>
        ) : (
          <>
            <span className="truncate">{menuLabel}</span>
            <AppIcons.chevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          </>
        )}
      </summary>
      <div
        className={`absolute right-0 z-50 max-w-[calc(100vw-1.5rem)] min-w-[15rem] rounded-md border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black/5 ${
          menuAlign === "up" ? "bottom-full mb-1" : "top-full mt-1"
        }`}
        data-testid="account-menu-panel"
      >
        <p className="px-3 pb-1 pt-2 text-sm font-semibold text-zinc-900">{menuLabel}</p>
        {showMyAccess ? <GlobalUserNavLinks onNavigate={() => setOpen(false)} /> : null}
        <Link
          href={CUSTOMER_SUPPORT_HREF}
          className={MENU_ITEM_CLASS}
          data-testid="account-menu-help"
          onClick={() => setOpen(false)}
        >
          Help & Support
        </Link>
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
    </details>
  );
}
