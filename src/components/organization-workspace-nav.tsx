"use client";

import { usePathname } from "next/navigation";

import { WorkspaceOwnedNav } from "@/components/shell/workspace-owned-nav";

export function OrganizationWorkspaceNav({
  organizationId,
  current,
  isAdmin,
}: {
  organizationId: string;
  current?: "portfolio" | "clients" | "members";
  isAdmin: boolean;
}) {
  const pathname = usePathname() ?? "";
  const resolved =
    current ??
    (pathname.endsWith("/members")
      ? "members"
      : pathname.endsWith("/clients")
        ? "clients"
        : "portfolio");

  const items = [
    { href: `/organization/${organizationId}`, label: "Portfolio" },
    ...(isAdmin
      ? [
          { href: `/organization/${organizationId}/clients`, label: "Clients" },
          { href: `/organization/${organizationId}/members`, label: "Members" },
        ]
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
