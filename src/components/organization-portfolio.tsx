"use client";

import { useMemo, useState } from "react";

import { enterContextAction } from "@/app/access/actions";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import type {
  OrganizationPortfolio,
  OrganizationPortfolioClientFacility,
  OrganizationPortfolioOwnedFacility,
  PersonalAccess,
} from "@/lib/organization-portfolio";

type RelationshipFilter = "all" | "owned" | "client";
type AccessFilter = "all" | "enterable" | "none";

function PersonalAccessCell({ personal }: { personal: PersonalAccess }) {
  if (!personal.enterable) {
    return <span className="text-sm text-zinc-600">No personal workspace access</span>;
  }
  return <span className="text-sm text-zinc-900">My access: {personal.roleLabel}</span>;
}

function OpenFacilityButton({ personal }: { personal: PersonalAccess }) {
  if (!personal.enterable) return null;
  return (
    <form action={enterContextAction}>
      <input type="hidden" name="contextKey" value={personal.contextKey} />
      <button
        type="submit"
        className={`rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 ${FOCUS_RING_CLASS}`}
      >
        Open Facility
      </button>
    </form>
  );
}

function matchesSearch(name: string, query: string): boolean {
  if (!query) return true;
  return name.toLowerCase().includes(query);
}

function matchesAccess(personal: PersonalAccess, access: AccessFilter): boolean {
  if (access === "all") return true;
  if (access === "enterable") return personal.enterable;
  return !personal.enterable;
}

export function OrganizationPortfolioView({ portfolio }: { portfolio: OrganizationPortfolio }) {
  const [query, setQuery] = useState("");
  const [relationship, setRelationship] = useState<RelationshipFilter>("all");
  const [access, setAccess] = useState<AccessFilter>("all");
  const normalizedQuery = query.trim().toLowerCase();

  const owned = useMemo(
    () =>
      portfolio.owned.filter(
        (row) => matchesSearch(row.facilityName, normalizedQuery) && matchesAccess(row.personal, access),
      ),
    [access, normalizedQuery, portfolio.owned],
  );
  const clients = useMemo(
    () =>
      portfolio.clients.filter(
        (row) => matchesSearch(row.facilityName, normalizedQuery) && matchesAccess(row.personal, access),
      ),
    [access, normalizedQuery, portfolio.clients],
  );

  const showOwned = relationship !== "client" && portfolio.owned.length > 0;
  const showClientTable = relationship !== "owned" && portfolio.clients.length > 0;
  const showClientEmpty =
    relationship === "all" && portfolio.owned.length > 0 && portfolio.clients.length === 0;
  const hasAnyFacilities = portfolio.owned.length > 0 || portfolio.clients.length > 0;
  const noMatches = hasAnyFacilities && !showOwned && !showClientTable && !showClientEmpty;

  return (
    <div className="space-y-6">
      {hasAnyFacilities ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="portfolio-search" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Search Facility name
            </label>
            <input
              id="portfolio-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={`mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm ${FOCUS_RING_CLASS}`}
            />
          </div>
          <div>
            <label htmlFor="portfolio-relationship" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Relationship
            </label>
            <select
              id="portfolio-relationship"
              value={relationship}
              onChange={(event) => setRelationship(event.target.value as RelationshipFilter)}
              className={`mt-1 block rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm ${FOCUS_RING_CLASS}`}
            >
              <option value="all">All</option>
              <option value="owned">Owned</option>
              <option value="client">Client</option>
            </select>
          </div>
          <div>
            <label htmlFor="portfolio-access" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              My access
            </label>
            <select
              id="portfolio-access"
              value={access}
              onChange={(event) => setAccess(event.target.value as AccessFilter)}
              className={`mt-1 block rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm ${FOCUS_RING_CLASS}`}
            >
              <option value="all">All access</option>
              <option value="enterable">My access</option>
              <option value="none">No personal access</option>
            </select>
          </div>
        </div>
      ) : null}

      {!hasAnyFacilities ? (
        <p className="text-sm text-zinc-600">No Facilities are connected to this organization yet.</p>
      ) : null}

      {noMatches ? (
        <p className="text-sm text-zinc-600" role="status">
          No Facilities match these filters.
        </p>
      ) : null}

      {showOwned ? (
        <OwnedTable rows={owned} totalCount={portfolio.owned.length} />
      ) : null}

      {showClientTable || showClientEmpty ? (
        <ClientTable
          rows={clients}
          totalCount={portfolio.clients.length}
          showEmptyMessage={showClientEmpty}
        />
      ) : null}
    </div>
  );
}

function OwnedTable({
  rows,
  totalCount,
}: {
  rows: OrganizationPortfolioOwnedFacility[];
  totalCount: number;
}) {
  return (
    <section className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">
        Owned Facilities ({totalCount})
      </h2>
      <table className="min-w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-2 font-medium">Facility</th>
            <th className="px-4 py-2 font-medium">Relationship</th>
            <th className="px-4 py-2 font-medium">My access</th>
            <th className="px-4 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-3 text-zinc-600" colSpan={4}>
                No owned Facilities match these filters.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.facilityId}>
                <td className="px-4 py-3 font-medium text-zinc-900">{row.facilityName}</td>
                <td className="px-4 py-3 text-zinc-700">Owned</td>
                <td className="px-4 py-3">
                  <PersonalAccessCell personal={row.personal} />
                </td>
                <td className="px-4 py-3">
                  <OpenFacilityButton personal={row.personal} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

function ClientTable({
  rows,
  totalCount,
  showEmptyMessage,
}: {
  rows: OrganizationPortfolioClientFacility[];
  totalCount: number;
  showEmptyMessage: boolean;
}) {
  if (totalCount === 0) {
    return showEmptyMessage ? (
      <p className="text-sm text-zinc-600">No current client relationships.</p>
    ) : null;
  }

  return (
    <section className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">
        Client Facilities ({totalCount})
      </h2>
      <table className="min-w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-2 font-medium">Facility</th>
            <th className="px-4 py-2 font-medium">Relationship</th>
            <th className="px-4 py-2 font-medium">Operating</th>
            <th className="px-4 py-2 font-medium">My access</th>
            <th className="px-4 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-3 text-zinc-600" colSpan={5}>
                No client Facilities match these filters.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.facilityPartnerOrganizationId}>
                <td className="px-4 py-3 font-medium text-zinc-900">{row.facilityName}</td>
                <td className="px-4 py-3 text-zinc-700">Client</td>
                <td className="px-4 py-3 text-zinc-700">
                  {row.operatingDepartmentNames.length > 0 ? row.operatingDepartmentNames.join(", ") : "—"}
                </td>
                <td className="px-4 py-3">
                  <PersonalAccessCell personal={row.personal} />
                </td>
                <td className="px-4 py-3">
                  <OpenFacilityButton personal={row.personal} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
