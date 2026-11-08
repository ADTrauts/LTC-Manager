import Link from "next/link";

import {
  formatMarketplaceInstallCount,
  formatMarketplaceResultCount,
  formatMarketplaceUsage,
  marketplaceCategoryOptions,
  marketplaceClearHref,
  marketplaceCreateAction,
  marketplaceEmptyCopy,
  marketplaceFamilyHref,
  marketplaceRecordTypeHref,
  marketplaceRefinementsActive,
  marketplaceRowHref,
  marketplaceStatusOptions,
  marketplaceTypeLabel,
  MARKETPLACE_FAMILIES,
  MARKETPLACE_RECORD_TYPES,
  type MarketplaceBrowseQuery,
  type MarketplaceRecordTypeKey,
} from "@/lib/harbor-console/console-catalog-browse";
import {
  CONSOLE_CATALOG_EMPTY,
  type ConsoleCatalogItem,
} from "@/lib/harbor-console/console-catalog";

const tabClass = (active: boolean) =>
  `rounded-md border px-3 py-1.5 text-sm ${
    active
      ? "border-[var(--run-aside)] bg-[var(--run-aside)] font-semibold text-[var(--run-aside-fg)]"
      : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:text-[var(--foreground)]"
  }`;

const selectClass =
  "rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm";

const createClass =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)]";

export function MarketplaceBrowse({
  items,
  rows,
  query,
}: {
  items: readonly ConsoleCatalogItem[];
  rows: readonly ConsoleCatalogItem[];
  query: MarketplaceBrowseQuery;
}) {
  const create = marketplaceCreateAction(query);
  const statusOptions = marketplaceStatusOptions(query);
  const categoryOptions = marketplaceCategoryOptions(items, query);
  const refinements = marketplaceRefinementsActive(query);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            Manage Vssyl Department Products, catalog Records, and Work presets from one place.
          </p>
        </div>
        {create ? (
          <Link href={create.href} className={createClass} data-testid="marketplace-create">
            {create.label}
          </Link>
        ) : null}
      </header>

      <nav aria-label="Marketplace families" className="flex flex-wrap gap-1">
        {MARKETPLACE_FAMILIES.map((family) => {
          const active = family.key === query.family;
          return (
            <Link
              key={family.key}
              href={marketplaceFamilyHref(query, family.key)}
              aria-current={active ? "page" : undefined}
              className={tabClass(active)}
            >
              {family.label}
            </Link>
          );
        })}
      </nav>

      {query.family === "records" ? (
        <nav aria-label="Record types" className="flex flex-wrap gap-1">
          {MARKETPLACE_RECORD_TYPES.map((type) => {
            const typeKey: MarketplaceRecordTypeKey | null = type.key === "all" ? null : type.key;
            const active = query.type === typeKey;
            return (
              <Link
                key={type.key}
                href={marketplaceRecordTypeHref(query, typeKey)}
                aria-current={active ? "page" : undefined}
                className={tabClass(active)}
              >
                {type.label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <form method="get" action="/console/catalog" className="flex flex-wrap items-end gap-3">
        {query.family !== "all" ? <input type="hidden" name="family" value={query.family} /> : null}
        {query.type ? <input type="hidden" name="type" value={query.type} /> : null}
        <label className="block min-w-56 flex-1 space-y-1">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Search</span>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query.q ?? ""}
            aria-label="Search Marketplace"
            placeholder="Name, key, or category"
            className={`${selectClass} w-full`}
          />
        </label>
        {statusOptions.length > 0 ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Status</span>
            <select
              id="status"
              name="status"
              aria-label="Status"
              defaultValue={query.status ?? ""}
              className={selectClass}
            >
              <option value="">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {categoryOptions.length > 0 ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Category</span>
            <select
              id="category"
              name="category"
              aria-label="Category"
              defaultValue={query.category ?? ""}
              className={selectClass}
            >
              <option value="">All categories</option>
              {categoryOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="submit"
          className="rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-medium"
        >
          Apply
        </button>
        {refinements ? (
          <Link
            href={marketplaceClearHref(query)}
            className="px-1 py-2 text-sm text-[var(--text-secondary)] hover:underline"
            data-testid="marketplace-clear"
          >
            Clear filters
          </Link>
        ) : null}
      </form>

      <p className="text-sm text-[var(--text-secondary)]" data-testid="marketplace-count">
        {formatMarketplaceResultCount(rows.length)}
      </p>

      <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-white">
        <table className="min-w-[960px] w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Version</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Installed</th>
              <th className="px-4 py-2 font-medium">Usage</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-[var(--text-secondary)]">
                  <p data-testid="marketplace-empty">{marketplaceEmptyCopy(query)}</p>
                  {create ? (
                    <Link href={create.href} className={`${createClass} mt-4`}>
                      {create.label}
                    </Link>
                  ) : null}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const href = marketplaceRowHref(row);
                return (
                  <tr
                    key={`${row.sourceType}:${row.stableKey}`}
                    data-testid="marketplace-row"
                    data-stable-key={row.stableKey}
                    data-family={row.catalogFamily}
                    data-navigable={href ? "true" : "false"}
                    className="border-b border-[var(--border)] last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      {href ? (
                        <Link href={href} className="font-medium hover:underline">
                          {row.name}
                        </Link>
                      ) : (
                        <p className="font-medium">{row.name}</p>
                      )}
                      <p className="text-xs text-[var(--text-secondary)]">{row.stableKey}</p>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{marketplaceTypeLabel(row)}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {row.categoryLabel ?? CONSOLE_CATALOG_EMPTY}
                    </td>
                    <td className="px-4 py-3">{row.versionDisplay}</td>
                    <td className="px-4 py-3">{row.statusLabel}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {formatMarketplaceInstallCount(row.facilityInstallCount)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {formatMarketplaceUsage(row.usageCount, row.usageLabel)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
