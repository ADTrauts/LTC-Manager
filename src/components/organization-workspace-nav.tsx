"use client";

import { usePathname } from "next/navigation";

import { WorkspaceOwnedNav } from "@/components/shell/workspace-owned-nav";

export function OrganizationWorkspaceNav({
  organizationId,
  current,
  isAdmin,
  showVendorDepartments = false,
}: {
  organizationId: string;
  current?: "portfolio" | "facilities" | "clients" | "members" | "departments" | "archive";
  isAdmin: boolean;
  showVendorDepartments?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const resolved =
    current ??
    (pathname.endsWith("/members")
      ? "members"
      : pathname.endsWith("/clients")
        ? "clients"
        : pathname.endsWith("/facilities")
          ? "facilities"
          : pathname.endsWith("/departments")
            ? "departments"
            : pathname.endsWith("/archive")
              ? "archive"
              : "portfolio");

  const items = [
    { href: `/organization/${organizationId}`, label: "Portfolio" },
    ...(isAdmin
      ? [
          { href: `/organization/${organizationId}/facilities`, label: "Facilities" },
          { href: `/organization/${organizationId}/clients`, label: "Clients" },
          { href: `/organization/${organizationId}/members`, label: "Members" },
        ]
      : []),
    ...(showVendorDepartments
      ? [{ href: `/organization/${organizationId}/departments`, label: "Departments" }]
      : []),
    ...(showVendorDepartments && isAdmin
      ? [{ href: `/organization/${organizationId}/archive`, label: "Archive" }]
      : []),
  ];

  return (
    <div data-testid="organization-workspace-nav">
      <WorkspaceOwnedNav items={items} label="Organization" />
      <span className="sr-only" data-current={resolved}>
        {resolved}
      </span>
    </div>
  );
}
