# Administration IA Navigation Implementation

**Date:** 2026-07-20  
**Mode:** ACT — presentation, terminology, and navigation only  
**Source of truth for current behavior:** `docs/administration/01_ADMINISTRATION_INFORMATION_ARCHITECTURE_AUDIT.md`

---

## Scope completed

Option A from the audit: regroup and relabel the Administration hub, standardize breadcrumbs, correct Facility Administrator audience copy, nest Organization Facilities under Organization Settings, and clarify Departments / Roles / Procedures & Resources user-facing language.

**No domain behavior changes.**

---

## Files changed

| Path | Change |
|------|--------|
| `src/lib/administration/admin-hub.ts` | Hub section/link definitions (labels, descriptions, hrefs) |
| `src/lib/administration/admin-hub.test.ts` | Hub grouping and label tests |
| `src/components/administration/admin-page-header.tsx` | Shared `AdminBreadcrumbs`, `AdminPageHeader`, `BackToAdministrationLink` |
| `src/components/administration/admin-page-header.test.ts` | Chrome + page-source presentation tests |
| `src/app/(protected)/admin/page.tsx` | Grouped hub; Administration title; FA copy |
| `src/app/(protected)/admin/facility/builder/page.tsx` | Facility Structure title + shared header |
| `src/app/(protected)/admin/departments/page.tsx` | Shared header + accurate visibility copy |
| `src/app/(protected)/admin/departments/department-visibility-form.tsx` | “Show in employee application” + non-license help |
| `src/app/(protected)/admin/departments/[departmentId]/page.tsx` | Shared breadcrumbs + Back to Administration |
| `src/app/(protected)/admin/permissions/page.tsx` | Roles & Permissions title + shared header |
| `src/app/(protected)/admin/permissions/permissions-manager.tsx` | Jobs → Roles user-facing strings |
| `src/app/(protected)/admin/inspections/page.tsx` | Shared header; Inspections title |
| `src/app/(protected)/admin/knowledge/page.tsx` | Procedures & Resources presentation |
| `src/app/(protected)/admin/organization/page.tsx` | Organization Settings + Facilities & User Access secondary nav |
| `src/app/(protected)/admin/organization/facilities/page.tsx` | Facilities & User Access title + nested trail |
| `docs/administration/01_ADMINISTRATION_INFORMATION_ARCHITECTURE_AUDIT.md` | Brief implementation-status pointer only |
| `docs/administration/02_ADMINISTRATION_IA_NAVIGATION_IMPLEMENTATION.md` | This document |

---

## Labels changed (user-facing)

| Before | After |
|--------|-------|
| Admin (hub H1) | Administration |
| General Managers only | Facility Administrators only |
| Facility Builder | Facility Structure |
| Organization | Organization Settings |
| Organization facilities (hub card) | Nested: Facilities & User Access (under Organization Settings) |
| Permissions / Jobs and route permissions | Roles & Permissions |
| Jobs (permissions manager sections) | Roles / Add role |
| Operational knowledge / Admin home | Procedures & Resources / Back to Administration |
| In employee app / turn off departments | Show in employee application (mode/HR visibility; not a license) |
| Breadcrumb root “Admin” | Administration |

Internal routes, Prisma models, and service names are unchanged.

---

## Navigation pattern introduced

Shared component: `src/components/administration/admin-page-header.tsx`

- Breadcrumb root always **Administration** → `/admin`
- Trail segments for nested pages (e.g. Organization Settings → Facilities & User Access)
- Optional **Back to Administration** action (default on)

Department Administration detail reuses `AdminBreadcrumbs` + `BackToAdministrationLink` inside the existing design-system `PageHeader` (keeps icon/status chrome without a second competing pattern).

Hub data: `ADMIN_HUB_SECTIONS` in `src/lib/administration/admin-hub.ts`.

---

## Routes preserved

| Capability | Href |
|------------|------|
| Facility Structure | `/admin/facility/builder` |
| Organization Settings | `/admin/organization` |
| Facilities & User Access | `/admin/organization/facilities` |
| Departments | `/admin/departments` |
| Department Administration | `/admin/departments/[departmentId]` |
| Roles & Permissions | `/admin/permissions` |
| Logs | `/logs` (hub link only; route not moved) |
| Inspections | `/admin/inspections` |
| Procedures & Resources | `/admin/knowledge` |

Direct links to `/admin/organization/facilities` continue to work.

---

## Tests added or updated

- `src/lib/administration/admin-hub.test.ts` — sections, labels, Logs href, Knowledge href, Org Facilities not primary, no licensing copy
- `src/components/administration/admin-page-header.test.ts` — FA wording, shared chrome usage, Roles not Jobs, visibility copy, knowledge non-ownership copy

**Run:**

```bash
npx tsx --test src/lib/administration/admin-hub.test.ts src/components/administration/admin-page-header.test.ts
npx tsx --test src/lib/administration-nav.test.ts src/lib/administration-menu-position.test.ts
```

**Outcomes:** All listed tests passed (13 + 11).

`npx tsc --noEmit` reports pre-existing project errors unrelated to these files; no new errors in Administration IA paths.

---

## Explicit non-goals (unchanged)

- No schema or migrations
- No Projection / LocationsViewModel / room assignment changes
- No Logs ↔ Inspections merge
- No Stripe entitlements
- No `showInEmployeeApp` semantics change
- No department-specific operators
- No Plant facility-wide policy change
- No Prisma `Role` / `JobTitle` / `KnowledgeArticle` renames

---

## Remaining inconsistencies

- Top-nav **Administration** dropdown still groups Employees / Logs / Menus / Assets / Repairs separately from the `/admin` hub (by design in this phase).
- Facility Builder client UI may still say “Facility Builder” in local chrome; page title is Facility Structure.
- Permissions action error still mentions “General Manager role” when referring to the `GM` `RoleKey` (accurate role-name, not admin audience).
- `/department/settings/[departmentId]` parallel head UI remains outside the hub (deferred product decision).
- Experience catalog `FORMS` / `CHECKLISTS` tool keys remain without models (out of scope).

---

## Manual verification notes

- Visit `/admin` — three section headings; seven primary links; no Organization Facilities primary card.
- Open Organization Settings — secondary “Facilities & User Access” block links to `/admin/organization/facilities`.
- Spot-check breadcrumbs on Facility Structure, Departments, Permissions, Inspections, Procedures & Resources, Organization Settings, Facilities & User Access.
- Confirm Logs hub entry opens `/logs` and Inspections remains `/admin/inspections`.

Screenshots were not captured in this automated session.
