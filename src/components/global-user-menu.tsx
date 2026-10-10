"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AppIcons } from "@/lib/design-system";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

export type GlobalUserMenuCurrentContext = {
  title: string;
  subtitle: string;
};

const MENU_ITEM_CLASS = `block w-full px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50 ${FOCUS_RING_CLASS}`;

export function CurrentContextHeader({
  currentContext,
}: {
  currentContext: GlobalUserMenuCurrentContext | null;
}) {
  if (!currentContext) return null;
  return (
    <div className="px-3 py-2" data-testid="global-user-menu-current-context">
      <p className="text-sm font-semibold text-zinc-900">{currentContext.title}</p>
      <p className="text-xs text-zinc-500">{currentContext.subtitle}</p>
    </div>
  );
}

export function GlobalUserNavLinks({
  onNavigate,
  itemClassName = MENU_ITEM_CLASS,
}: {
  onNavigate?: () => void;
  itemClassName?: string;
}) {
  return (
    <>
      <Link
        href="/access"
        className={itemClassName}
        data-testid="account-menu-my-access"
        onClick={onNavigate}
      >
        My Access
      </Link>
      <Link
        href="/account"
        className={itemClassName}
        data-testid="account-menu-my-account"
        onClick={onNavigate}
      >
        My Account
      </Link>
    </>
  );
}

/**
 * Lightweight User menu for Organization and partner shells.
 * Workspace-local actions stay in those shells.
 */
export function GlobalUserMenu({
  menuLabel,
  currentContext,
}: {
  menuLabel: string;
  currentContext: GlobalUserMenuCurrentContext | null;
}) {
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
      data-testid="global-user-menu"
    >
      <summary
        className={`flex min-h-10 max-w-[10rem] cursor-pointer list-none items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 ${FOCUS_RING_CLASS} [&::-webkit-details-marker]:hidden sm:px-3`}
        aria-label={`Account menu for ${menuLabel}`}
        title={menuLabel}
        data-testid="global-user-menu-trigger"
      >
        <UserIcon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <span className="hidden truncate lg:inline">{menuLabel}</span>
        <AppIcons.chevronDown className="hidden h-4 w-4 shrink-0 opacity-70 sm:inline" />
      </summary>
      <div className="absolute right-0 top-full z-50 mt-1 max-w-[calc(100vw-1.5rem)] min-w-[15rem] rounded-md border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black/5">
        <CurrentContextHeader currentContext={currentContext} />
        {currentContext ? <div className="mx-3 my-1 border-t border-zinc-100" role="separator" /> : null}
        <GlobalUserNavLinks onNavigate={() => setOpen(false)} />
        <form action="/api/auth/logout" method="post">
          <button type="submit" className={MENU_ITEM_CLASS} data-testid="account-menu-sign-out">
            <span className="inline-flex items-center gap-2">
              <SignOutIcon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              Sign out
            </span>
          </button>
        </form>
      </div>
    </details>
  );
}
