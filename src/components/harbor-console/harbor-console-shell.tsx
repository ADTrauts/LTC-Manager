"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/console", label: "Today", enabled: true },
  { href: "/console/customers", label: "Customers", enabled: true },
  { href: "/console/tickets", label: "Tickets", enabled: false },
  { href: "/console/catalog", label: "Marketplace", enabled: true },
] as const;

function navActive(pathname: string, href: string) {
  if (href === "/console") {
    return pathname === "/console";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function HarborConsoleShell({
  staffName,
  staffRole,
  children,
}: {
  staffName: string;
  staffRole: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <aside className="flex w-56 shrink-0 flex-col justify-between bg-[var(--run-aside)] px-4 py-6 text-[var(--run-aside-fg)]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--run-aside-muted)]">
            LTC Corp
          </p>
          <p className="mt-2 text-base font-semibold tracking-tight">Harbor Console</p>
          <nav className="mt-8 flex flex-col gap-1" aria-label="Harbor">
            {NAV.map((item) => {
              const active = navActive(pathname, item.href);
              if (!item.enabled) {
                return (
                  <span
                    key={item.href}
                    className="rounded-md px-3 py-2 text-sm text-[var(--run-aside-muted)]"
                  >
                    {item.label}
                  </span>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-sm ${
                    active ? "bg-white/10 font-semibold" : "text-[var(--run-aside-fg)] hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="space-y-3 px-1">
          <div>
            <p className="text-sm font-medium">{staffName}</p>
            <p className="text-xs text-[var(--run-aside-muted)]">{staffRole === "OWNER" ? "Owner" : "Member"}</p>
          </div>
          <form action="/api/console/auth/logout" method="post">
            <button
              type="submit"
              className="text-xs font-medium text-[var(--run-aside-muted)] underline-offset-2 hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
