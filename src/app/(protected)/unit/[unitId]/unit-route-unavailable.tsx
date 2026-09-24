/**
 * Phase 6R — fail-closed / structural presentations.
 * Never fall through to leftover Unit Workspace current truth.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/design-system/page-header";

export type UnitRouteUnavailableKind =
  | "structural"
  | "projection_off"
  | "locations_unavailable";

type NavLink = {
  href: string;
  label: string;
};

type Props = {
  kind: UnitRouteUnavailableKind;
  unitName?: string;
  hierarchyRole?: "FLOOR" | "BUILDING" | null;
  links?: NavLink[];
};

const COPY: Record<
  UnitRouteUnavailableKind,
  { title: string; body: string }
> = {
  structural: {
    title: "This location is structural",
    body: "Floors and buildings are containers. They are not operational workspaces.",
  },
  projection_off: {
    title: "Location workspace unavailable",
    body: "Canonical location projection is not available.",
  },
  locations_unavailable: {
    title: "Location workspace unavailable",
    body: "Locations could not be loaded for this facility.",
  },
};

export function UnitRouteUnavailable({
  kind,
  unitName,
  hierarchyRole,
  links = [],
}: Props): ReactNode {
  const copy = COPY[kind];
  const subtitle =
    kind === "structural"
      ? hierarchyRole === "BUILDING"
        ? "Building"
        : "Floor"
      : undefined;

  return (
    <section
      className="mx-auto max-w-5xl space-y-5"
      data-testid={`unit-route-unavailable-${kind}`}
    >
      <PageHeader
        icon="locations"
        title={unitName ?? "Location"}
        subtitle={subtitle}
        compact
      />
      <div
        className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm"
        role="status"
      >
        <p className="font-semibold text-zinc-900">{copy.title}</p>
        <p className="mt-1">{copy.body}</p>
        {links.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
