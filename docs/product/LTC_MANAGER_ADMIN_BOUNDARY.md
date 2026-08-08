# LTC Manager — ADMIN Boundary

**Mode:** ADMIN — *Govern the organization, facilities, and access relationships.*
**Companion docs:** `LTC_MANAGER_BUILD_RUN_INFORMATION_ARCHITECTURE_2026-08-08.md`, `LTC_MANAGER_RUN_GUIDE.md`, `LTC_MANAGER_BUILD_GUIDE.md`

---

## Principle

Admin is **governance**, not operation. It is reached only by authorized governance users (Facility Administrator) and is deliberately **not** presented as a third everyday operating mode. In the shell, Admin appears as a trailing governance entry, separate from the RUN / BUILD segmented switch — never as a co-equal segment.

Operational configuration that used to live under `/admin` moves out of Admin when BUILD is its canonical owner. Admin does not duplicate Build settings.

## Canonical Admin areas

| Area | Route | Owns |
|------|-------|------|
| **Organization** | `/admin/organization` | Organization identity, parent/management-company relationships |
| **Facilities** | `/admin/organization/facilities` | Facilities within the organization |
| **Department Access** | `/admin` + department access surfaces | Which users/roles may act in which departments |
| **Facility Administrators** | `/admin` | Facility administrator assignment |
| **Management Company Relationships** | `/admin/organization` | Management-company relationships |
| **Access Matrix** | `/admin/permissions` | **Read-only** governance view of the platform route authorization policy |
| **Account & Security** | `/account` | Per-user account and security (all authenticated users) |
| **Request-routing governance** | `/admin` | Only where genuinely organization-level (operational routing behavior lives in Department Builder) |

## Moved OUT of Admin into BUILD (Phase 13)

| Surface | Was | Now |
|---------|-----|-----|
| Department Builder | `/admin/departments` (Admin-adjacent) | **BUILD** top-level |
| Facility Builder | `/admin/facility/builder` (Admin) | **BUILD** top-level |
| Procedures & Resources | `/admin/knowledge` (Admin) | **BUILD** top-level |
| Legacy Inspections config | `/admin/inspections` (Admin) | **Legacy**, hidden from nav (superseded by Operational Templates) |

Route paths are unchanged (no new domain routes); only their **mode classification and navigation placement** changed. Authorization is unchanged in the route registry.

## What Admin must NOT become

- Not a third operating mode presented equally to RUN / BUILD.
- Not a home for operational configuration that BUILD owns.
- Not a place that grants operational authority. Facility Admin alone does not gain department RUN authority; operational actions still revalidate department authority downstream.
- Not a duplicate of Build or Account settings.

## Access Matrix

`/admin/permissions` renders the platform route registry read-only. It cannot change policy; it is a governance visibility surface. It reflects — but never overrides — `src/lib/route-registry/platform-routes.ts`.

## Known finding

A dedicated Admin/governance **home** for a Facility Administrator without an operational relationship is deferred; FA currently lands on the RUN Dashboard and reaches Admin deliberately. This does not weaken authorization (Admin routes remain FA-restricted at the proxy).
