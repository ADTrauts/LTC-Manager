import type { HarborAuditAction, Prisma, PrismaClient } from "@prisma/client";

import { PLATFORM_CATALOG_OWNER } from "@/lib/canonical-logs/catalog-ownership";
import { validateHarborStaffSession, type HarborJwtPayload } from "./auth";
import { HARBOR_CUSTOMER_PAGE_SIZE, harborCustomerPageWindow } from "./pagination";

export const HARBOR_ACTIVITY_FILTERS = [
  { key: "all", label: "All recorded activity" },
  { key: "sign-ins", label: "Sign-ins" },
  { key: "customers", label: "Customer activity" },
  { key: "catalog", label: "Marketplace activity" },
] as const;

export type HarborActivityFilter = (typeof HARBOR_ACTIVITY_FILTERS)[number]["key"];

const customerActions: HarborAuditAction[] = ["VIEW_CUSTOMER", "PROVISION_FACILITY", "FACILITY_SUSPEND", "FACILITY_REACTIVATE"];
const catalogActions: HarborAuditAction[] = [
  "CATALOG_CREATE", "CATALOG_PUBLISH", "CATALOG_RETIRE", "CATALOG_DRAFT_SUCCESSOR",
];
const actionsByFilter: Record<HarborActivityFilter, HarborAuditAction[]> = {
  all: ["LOGIN", ...customerActions, ...catalogActions],
  "sign-ins": ["LOGIN"],
  customers: customerActions,
  catalog: catalogActions,
};
const labels: Partial<Record<HarborAuditAction, string>> = {
  LOGIN: "Signed in to the Console",
  VIEW_CUSTOMER: "Reviewed a customer",
  PROVISION_FACILITY: "Provisioned a Facility",
  FACILITY_SUSPEND: "Suspended Facility operational changes",
  FACILITY_REACTIVATE: "Reactivated Facility operational changes",
  CATALOG_CREATE: "Created a Marketplace draft",
  CATALOG_PUBLISH: "Published a Marketplace Record",
  CATALOG_RETIRE: "Retired a Marketplace Record",
  CATALOG_DRAFT_SUCCESSOR: "Created a successor draft",
};

export function parseHarborActivityFilter(value: unknown): HarborActivityFilter {
  return HARBOR_ACTIVITY_FILTERS.find((filter) => filter.key === value)?.key ?? "all";
}

export function harborActivityHref(filter: HarborActivityFilter, page = 1) {
  const query = new URLSearchParams({ filter });
  if (page > 1) query.set("page", String(page));
  return `/console/activity?${query}`;
}

/** Own recorded actions only; never a general staff/assistance audit reader. */
export async function loadHarborOwnActivity(
  db: PrismaClient,
  session: HarborJwtPayload,
  input: { filter?: unknown; page?: string | string[] },
) {
  if (session.staffRole !== "OWNER") return null;
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const authority = await validateHarborStaffSession(session, tx);
    if (!authority.valid || authority.staff.role !== "OWNER") return null;

    const filter = parseHarborActivityFilter(input.filter);
    const where = {
      staffId: authority.staff.id,
      action: { in: actionsByFilter[filter] },
    } satisfies Prisma.HarborAuditEventWhereInput;
    const total = await tx.harborAuditEvent.count({ where });
    const window = harborCustomerPageWindow(total, input.page);
    const events = total ? await tx.harborAuditEvent.findMany({
      where, skip: window.offset, take: HARBOR_CUSTOMER_PAGE_SIZE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true, action: true, createdAt: true, facilityId: true,
        catalogPublication: { select: { definitionId: true, stableKey: true, version: true } },
      },
    }) : [];

    const facilityIds = [...new Set(events.flatMap((event) => event.facilityId ? [event.facilityId] : []))];
    const definitionIds = events.flatMap((event) => event.catalogPublication ? [event.catalogPublication.definitionId] : []);
    const [facilities, definitions] = await Promise.all([
      facilityIds.length ? tx.facility.findMany({
        where: { id: { in: facilityIds } }, select: { id: true, displayName: true },
      }) : [],
      definitionIds.length ? tx.catalogLogDefinition.findMany({
        where: { ...PLATFORM_CATALOG_OWNER, id: { in: definitionIds } },
        select: { id: true, stableKey: true, version: true },
      }) : [],
    ]);
    const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));
    const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
    const rows = events.map((event) => {
      const row = {
        id: event.id, label: labels[event.action] ?? "Recorded activity", occurredAt: event.createdAt,
        detail: null as string | null, href: null as string | null, linkLabel: null as string | null,
      };
      if (customerActions.includes(event.action)) {
        const facility = event.facilityId ? facilityById.get(event.facilityId) : null;
        row.detail = facility ? `Current Facility: ${facility.displayName}` : event.facilityId
          ? "The recorded Facility is no longer available." : "A Facility reference was not recorded.";
        if (facility) {
          row.href = `/console/customers/${encodeURIComponent(facility.id)}`;
          row.linkLabel = "Open customer";
        }
      } else if (event.action !== "LOGIN") {
        const publication = event.catalogPublication;
        const current = publication ? definitionById.get(publication.definitionId) : null;
        // A retained identifier must not become a reader for a now-private Record.
        if (publication && current && current.stableKey === publication.stableKey && current.version === publication.version) {
          row.detail = `${publication.stableKey} · version ${publication.version}`;
          row.href = `/console/catalog/${encodeURIComponent(publication.stableKey)}`;
          row.linkLabel = "Open Record history";
        } else {
          row.detail = publication ? `Published version ${publication.version}; the Record is unavailable in Marketplace.`
            : "A Record reference was not recorded for this event.";
        }
      }
      return row;
    });
    return { filter, total, ...window, rows, staffName: authority.staff.displayName };
  }, { isolationLevel: "RepeatableRead" });

  // A completed logout or authority change must invalidate an assembled snapshot.
  if (!result) return null;
  const current = await validateHarborStaffSession(session, db);
  return current.valid && current.staff.role === "OWNER" ? result : null;
}
