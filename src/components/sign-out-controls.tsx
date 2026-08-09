"use client";

import Link from "next/link";
import type { FormEvent } from "react";

import { AppIcons } from "@/lib/design-system";
import { clearAllOfflineData, clearForSignOut } from "@/lib/offline/local-store";

type AccountMenuProps = {
  showUnbind: boolean;
  showChangePassword?: boolean;
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

/**
 * Account menu — the single right-aligned entry point for user/account actions.
 *
 * Change password and Sign out live here rather than as permanent top-level header buttons, keeping
 * the global bar focused on context (facility, department, Run/Build) instead of every account
 * destination. Facility Administrators additionally get "Sign out & unbind device". Sign-out still
 * clears the offline bundle before the session cookie is removed (shared-tablet safety).
 */
export function AccountMenu({ showUnbind, showChangePassword = false }: AccountMenuProps) {
  const UserIcon = AppIcons.user;
  const SignOutIcon = AppIcons.signOut;

  return (
    <details className="group relative flex" data-testid="account-menu">
      <summary
        data-testid="account-menu-trigger"
        className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 [&::-webkit-details-marker]:hidden sm:px-3"
        aria-label="Account menu"
        title="Account"
      >
        <UserIcon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <span className="hidden sm:inline">Account</span>
        <AppIcons.chevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      </summary>
      <div
        className="absolute right-0 top-full z-50 mt-1 min-w-[14rem] rounded-md border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
        data-testid="account-menu-panel"
      >
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
    </details>
  );
}
