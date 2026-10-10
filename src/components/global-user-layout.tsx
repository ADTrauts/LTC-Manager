"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

const NAV_LINK_CLASS = `text-sm font-medium underline-offset-2 hover:underline ${FOCUS_RING_CLASS}`;

function navClass(active: boolean): string {
  return `${NAV_LINK_CLASS} ${active ? "text-zinc-900 underline" : "text-zinc-700"}`;
}

/**
 * Neutral chrome for global User surfaces: My Access and My Account.
 * Not a Facility, Organization, or partner workspace shell.
 */
export function GlobalUserLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const accessActive = pathname === "/access";
  const accountActive = pathname === "/account" || pathname.startsWith("/account/");

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <p className="text-sm font-semibold tracking-tight text-zinc-900">Vssyl</p>
          <nav className="flex items-center gap-4" aria-label="Account">
            <Link
              href="/access"
              className={navClass(accessActive)}
              aria-current={accessActive ? "page" : undefined}
              data-testid="global-user-nav-access"
            >
              My Access
            </Link>
            <Link
              href="/account"
              className={navClass(accountActive)}
              aria-current={accountActive ? "page" : undefined}
              data-testid="global-user-nav-account"
            >
              My Account
            </Link>
          </nav>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className={`text-sm font-medium text-zinc-700 underline underline-offset-2 ${FOCUS_RING_CLASS}`}
              data-testid="global-user-nav-sign-out"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
