import Link from "next/link";

export function OrganizationWorkspaceNav({
  organizationId,
  current,
  isAdmin,
}: {
  organizationId: string;
  current: "home" | "clients" | "members";
  isAdmin: boolean;
}) {
  const links = [
    { href: `/organization/${organizationId}`, label: "Home", key: "home" as const },
    ...(isAdmin
      ? [
          { href: `/organization/${organizationId}/clients`, label: "Clients", key: "clients" as const },
          { href: `/organization/${organizationId}/members`, label: "Members", key: "members" as const },
        ]
      : []),
  ];
  return (
    <nav className="flex gap-4 text-sm" aria-label="Organization">
      {links.map((link) => (
        <Link
          key={link.key}
          href={link.href}
          className={
            link.key === current
              ? "font-semibold text-zinc-900"
              : "font-medium text-zinc-600 underline-offset-2 hover:underline"
          }
          aria-current={link.key === current ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
