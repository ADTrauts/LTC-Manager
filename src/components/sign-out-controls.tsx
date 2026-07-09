import Link from "next/link";

import { AppIcons } from "@/lib/design-system";

type SignOutControlsProps = {
  showUnbind: boolean;
  showChangePassword?: boolean;
};

function SignOutButton({ className }: { className: string }) {
  const SignOutIcon = AppIcons.signOut;

  return (
    <button type="submit" className={className}>
      <SignOutIcon className="mr-1.5 inline h-4 w-4 shrink-0 opacity-70" aria-hidden />
      Sign out
    </button>
  );
}

export function SignOutControls({ showUnbind, showChangePassword = false }: SignOutControlsProps) {
  if (!showUnbind) {
    return (
      <div className="flex items-center gap-2">
        {showChangePassword ? (
          <Link
            href="/account"
            className="min-h-10 rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            Change password
          </Link>
        ) : null}
        <form action="/api/auth/logout" method="post">
          <SignOutButton className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50" />
        </form>
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-2">
      {showChangePassword ? (
        <Link
          href="/account"
          className="min-h-10 rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          Change password
        </Link>
      ) : null}
      <div className="flex min-h-10 items-stretch rounded-md border border-zinc-300 bg-white shadow-sm">
      <form action="/api/auth/logout" method="post" className="flex min-w-0">
        <SignOutButton className="inline-flex min-h-10 items-center rounded-l-md border-r border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50" />
      </form>
      <details className="group relative flex">
        <summary
          className="flex min-h-10 cursor-pointer list-none items-center justify-center rounded-r-md px-2.5 text-zinc-600 hover:bg-zinc-50 [&::-webkit-details-marker]:hidden"
          aria-label="Additional sign-out options"
        >
          <AppIcons.chevronDown className="h-4 w-4" aria-hidden />
        </summary>
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[14rem] rounded-md border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black/5">
          <form action="/api/auth/logout-full" method="post">
            <button
              type="submit"
              className="w-full px-3 py-2 text-left text-sm font-medium text-amber-900 hover:bg-amber-50"
              title="Clears session, facility binding, and unit lock on this browser"
            >
              Sign out &amp; unbind device
            </button>
          </form>
        </div>
      </details>
    </div>
    </div>
  );
}
