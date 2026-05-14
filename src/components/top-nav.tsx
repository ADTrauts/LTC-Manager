"use client";

import Link from "next/link";

import { useNavPathname } from "@/hooks/use-nav-pathname";

type TopNavProps = {
  items: { label: string; href: string }[];
};

function linkClass(isActive: boolean) {
  return isActive
    ? "app-accent-active rounded-md px-3 py-2 text-sm font-medium text-white"
    : "rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900";
}

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/employees") {
    return (
      pathname === "/employees" ||
      pathname.startsWith("/employees/import") ||
      pathname.startsWith("/employees/points-summary") ||
      pathname.startsWith("/employees/separations") ||
      pathname.startsWith("/employees/terminations") ||
      pathname.startsWith("/employees/chrc-report") ||
      pathname.startsWith("/employees/hr-audit")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav({ items }: TopNavProps) {
  const pathname = useNavPathname();

  return (
    <nav
      className="flex w-max min-w-0 flex-nowrap items-center gap-2"
      aria-label="Top navigation"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`shrink-0 ${linkClass(isActivePath(pathname, item.href))}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
