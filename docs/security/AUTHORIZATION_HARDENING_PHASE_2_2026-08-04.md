# Authorization Hardening — Phase 2

**Platform-Owned Route Policy and Fail-Closed Authorization**

- **Date:** 2026-08-04
- **Branch:** `security/authorization-hardening-phase-2-2026-08-04`
- **Baseline:** Phase 1 tip `464892b2ec57985f0a8526cfebcea05507e73820`
- **Decision record:** `docs/architecture/ADR_PLATFORM_OWNED_ROUTE_AUTHORIZATION_2026-08-04.md`

## 1. Original findings

**CRIT-2 — cross-tenant authorization mutation.** `Role`, `AppRoute`, and `RoleRoutePermission` have
no `facilityId`; they are deployment-global. The `/admin/permissions` screen exposed four Server
Actions (`setRoutePermissionAction`, `cloneRolePermissionsAction`, `createRoleAction`,
`updateRoleAction`) that any Facility Administrator could invoke. One administrator at one customer
could therefore change role-to-route authorization for every facility in the deployment.

**HIGH-1 — allow by default.** `resolveRouteAccess` returned `true` when no `AppRoute` prefix matched
the request path. Any authenticated user reached any unenumerated path, and a route added in code but
never seeded into `AppRoute` was open to all six roles.

## 2. Ownership decision

Route authorization policy is **platform-owned and version controlled**. It lives in
`src/lib/route-registry/platform-routes.ts` and changes only through code review and deployment.

Facility Administrators **do**:

- assign users to platform roles,
- manage which Facilities a user may access,
- manage which Departments a user may access,
- manage department membership, department heads, and operational scope,
- manage assignments, unit access, and device binding.

Facility Administrators **cannot**:

- redefine what `FACILITY_ADMINISTRATOR`, `GM`, `MANAGER`, `SUPERVISOR`, `LEAD_TEAM_MEMBER`, or
  `STAFF` means,
- change role-to-route policy,
- change public versus protected route classification,
- change API authentication classification,
- create, rename, or deactivate a role.

Legacy `AppRoute` and `RoleRoutePermission` rows are **non-authoritative**. Nothing reads them at
runtime.

## 3. Canonical route registry

One module, `src/lib/route-registry/platform-routes.ts`, is the source. Everything else is a
projection of it:

| Consumer | Module | Reads |
| --- | --- | --- |
| Proxy authorization | `src/proxy.ts` → `authorize.ts` | registry |
| Primary navigation | `navigation.ts` → `app-shell.tsx` | registry |
| Read-only Access Matrix | `access-matrix.ts` → `/admin/permissions` | registry |
| Legacy compatibility seed | `legacy-mirror.ts` → `prisma/legacy-route-mirror.json` | registry |
| Tests | `src/lib/route-registry/*.test.ts` | registry |

**Design choice.** The registry is a plain typed TypeScript data module rather than JSON or a code
generator. It needs comments, a shared `rolesAtLeast` helper, and compile-time checking of role names
and access shapes, none of which JSON provides. The one consumer that cannot import TypeScript —
`prisma/seed.mjs` — reads a committed generated artifact, `prisma/legacy-route-mirror.json`, produced
by `npm run route-mirror:generate`. `legacy-mirror.test.ts` regenerates the mirror from the registry
and fails on any difference, so the generated copy cannot drift from its source.

### Counts

| Measure | Count |
| --- | --- |
| Registry entries | 67 |
| Page routes | 41 (40 on disk + 1 redirect-only) |
| API routes | 19 |
| Internal / static paths | 7 |
| Public | 9 (3 pages, 6 APIs) |
| Authenticated (any role) | 3 pages |
| Role-restricted | 43 (34 pages, 9 APIs) |
| Handler-authorized APIs | 4 |
| Redirect-only | 1 (`/settings`) |
| Feature-gated | 4 (`/today`, `/today/coverage`, `/today/handoffs`, `/today/walk`) |
| Entries requiring downstream authorization | 20 |
| Navigation entries | 10 |

### Page classification

| Classification | Routes |
| --- | --- |
| Public | `/`, `/login`, `/signup` |
| Authenticated | `/setup`, `/account`, `/department/settings/[departmentId]` |
| Facility Administrator | `/admin` and all nine `/admin` subroutes |
| Manager and above | `/employees` and its six subroutes, `/reports` |
| Supervisor and above | `/workspace`, `/units`, `/menus`, `/assets`, `/staffing`, `/staffing/assignments`, `/today` and its three subroutes |
| All roles | `/dashboard`, `/operations`, `/logs`, `/repairs`, `/repairs/[id]`, `/issues/[issueId]`, `/unit/[unitId]` |
| Redirect only | `/settings` → `/admin/organization` for Facility Administrators, default home otherwise |

`/pin` is listed in the Phase 2 brief but does not exist in this codebase. Quick PIN sign-in is served
by `/login` and `POST /api/auth/pin-login`; no separate page was invented to satisfy the list.

### API classification

| Classification | Routes |
| --- | --- |
| Public | `/api/auth/login`, `/api/auth/pin-login`, `/api/auth/signup`, `/api/auth/logout`, `/api/auth/device-facility`, `/api/billing/webhook` |
| Handler-authorized (session required) | `/api/auth/session`, `/api/auth/active-unit`, `/api/auth/active-department`, `/api/auth/switch-facility` |
| Facility Administrator at the proxy | `/api/auth/bind-device`, `/api/auth/logout-full`, `/api/onboarding/state`, `/api/onboarding/locations`, `/api/onboarding/managers`, `/api/billing/setup-intent`, `/api/billing/payment-method/default`, `/api/debug/projection-shadow` |
| Manager and above at the proxy | `/api/facility/union-handbook` |

Two endpoints were tightened rather than assumed public. `/api/auth/active-department` sat in the old
`PUBLIC_PATHS` list even though its handler required a session; it is now registered as
authenticated. `/api/auth/device-facility` was inspected and confirmed genuinely public — it reads
only the device-bound Facility and Unit cookies to render the kiosk sign-in screen before anyone has
authenticated.

`/api/billing/webhook` remains public because Stripe cannot present a session; it is authenticated by
signature verification against the webhook secret.

**Proxy registration never replaces handler checks.** Every non-public API is marked
`requiresDownstreamAuthorization`, and `platform-routes.test.ts` fails if that flag is missing. The
handler-level `requireAtLeastRole`, ownership, and Facility-scope checks were left exactly as they
were.

## 4. Fail-closed behavior

`authorizeRoute` has no allow-by-default branch. The final unmatched classification is
**NOT FOUND BY DEFAULT**.

| Situation | Page result | API result |
| --- | --- | --- |
| Unregistered path | `404` | `404` JSON |
| Registered, no session | `307` to `/login` | `401` JSON |
| Registered, session, role not approved | `307` to the caller's default home | `403` JSON |
| Registered, feature flag off | `307` to the caller's default home | `403` JSON |
| Registered redirect | `307` to the destination or default home | n/a |

An unregistered path is Not Found **regardless of authentication**. Being signed in — including as a
Facility Administrator — opens nothing that is not registered.

Matching is segment-based, not string-prefix based:

- `/unit/[unitId]` matches `/unit/abc` and never `/units`.
- `/admin` never captures `/administration`.
- `/today` never captures `/today-evil`.
- Longest-specific match wins: more segments first, then more literal segments, then exact over prefix.
- Trailing slashes normalize; query strings and fragments are ignored.
- Every real page and API route is registered `EXACT`, so `/admin/unknown-subpage` is Not Found rather
  than inheriting the `/admin` grant.

`src/lib/route-permissions.ts` and its test, which contained the allow-by-default branch, were
deleted. Tests that asserted unmatched-route allowance (`/today-evil`, `/today/walk/nested`) now
assert denial.

## 5. Legacy table disposition

`Role`, `AppRoute`, and `RoleRoutePermission` were **not dropped**.

- **`Role`** remains valid identity and reference data: it names roles and carries the `User.roleId`
  relation. It does not define capability.
- **`AppRoute` and `RoleRoutePermission`** are retained for compatibility, historical migration
  continuity, and transitional inspection. Both models carry `///` schema comments stating they are
  non-authoritative. No SQL migration was needed; documentation comments emit no DDL.

**Remaining readers at runtime: none.** The only former readers were `route-permissions.ts` (deleted)
and `/admin/permissions/page.tsx` (now reads the registry).

**Remaining writers:**

| Writer | Reachable by a Facility Administrator? |
| --- | --- |
| The three historical migrations that created and populated the tables | No |
| `prisma/seed.mjs`, from `prisma/legacy-route-mirror.json` | No |

`setRoutePermissionAction`, `cloneRolePermissionsAction`, `createRoleAction`, and `updateRoleAction`
were deleted along with `src/app/(protected)/admin/permissions/actions.ts`.
`access-matrix.test.ts` scans the whole `src` tree and fails if any of those symbols reappears.

**Seed behavior.** Seed populates the mirror from the generated artifact. Fresh seed produces 15
`AppRoute` rows, 90 `RoleRoutePermission` rows, and 6 `Role` rows — identical to the pre-Phase-2
result. Upserts keyed on `AppRoute.key` and `(roleId, appRouteId)` make repeated seeding
non-duplicating. `/evs` is absent and removed routes are not recreated; `legacy-mirror.test.ts`
asserts both. `/admin` remains `FACILITY_ADMINISTRATOR`-only in the mirror. No Facility-specific
values and no `facilityId` were introduced.

**Why drift cannot affect authorization.** `authorizeRoute` is a synchronous pure function of the
registry, the caller's role, and feature-flag state. It imports no Prisma client, and
`authorize.test.ts` asserts its source contains neither `prisma` nor `await`. There is no code path
from a database row to a route decision.

## 6. Access Matrix

`/admin/permissions` remains, as a read-only Access Matrix.

- **Route:** `/admin/permissions`, `FACILITY_ADMINISTRATOR` only, enforced at the proxy by the
  registry and again by `assertFacilityAdministratorPage()` and the `/admin` layout guard.
- **Data source:** `buildAccessMatrix()`, which asks the real `authorizeRoute` for every
  route × role pair. The screen reports what the proxy will actually do rather than a separate
  description of it.
- **Behavior:** no form, no button, no input, no select, no Server Action, no Prisma call. The page
  states that Facility Administrators assign people to roles but cannot change what a role is allowed
  to reach.
- **Scope:** page routes are grouped by product module. API policy is available to developers through
  `buildAccessMatrix().apiGroups` and this document, and is not rendered into the administrator view.
- **Mutation removal:** the actions file is deleted, not hidden. A replayed Server Action POST against
  the old endpoint returns `404`.

## 7. Navigation

Primary navigation is `platformNavItemsForRole()`, a projection of the same registry. Each candidate
link is re-checked through `roleMayAccessRoute` — the identical decision the proxy makes — so a role
can never be offered a link it would be denied.

- Labels and ordering come from the registry, not from `AppRoute` rows.
- Absence from navigation does not deny access: `/dashboard`, `/operations`, `/account`, `/staffing`
  and the dynamic detail routes stay reachable by URL for approved roles.
- The redirect-only `/settings` and internal paths never appear as links.
- `/evs` is absent for every role.
- Department scoping (`filterNavItemsForDepartmentScope`) and Facility context are applied after the
  role projection, unchanged.
- Role-specialized surfaces remain distinct: Dashboard, Workspace, Today's Work, Staffing, and Unit
  Workspace are separate entries with their own policies.

## 8. Runtime verification

Two disposable databases, same production build, 61 migrations each.

- **Database A** — all migrations plus normal seed.
- **Database B** — same, then the legacy matrix was attacked: `STAFF` granted `/admin`;
  `FACILITY_ADMINISTRATOR` denied `/admin`; `STAFF` granted `/employees` and `/reports`; the
  `/workspace` and `/units` rows deleted; fabricated `/evs` and `/admin/takeover` routes inserted and
  granted to all six roles; labels on `/logs`, `/repairs`, `/reports`, `/menus` replaced with
  `HOSTILE LABEL` and reordered; `/dashboard` deactivated; every `LEAD_TEAM_MEMBER` permission
  deleted. A third pass then deleted **all** rows from both tables.

Every scenario was probed for all six roles plus an anonymous caller.

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Unauthenticated protected page redirects to `/login` | PASS |
| 2 | Unauthenticated protected API returns `401`, not a redirect | PASS |
| 3 | STAFF reaches `/logs`, `/dashboard`, `/repairs`; denied `/admin` and `/employees` | PASS |
| 4 | SUPERVISOR reaches `/today` and `/staffing`; denied `/admin` | PASS |
| 5 | MANAGER reaches `/employees` and `/reports`; denied `/admin` | PASS |
| 6 | GM reaches its approved routes; denied `/admin` | PASS |
| 7 | FACILITY_ADMINISTRATOR reaches `/admin`, views the Access Matrix, cannot mutate policy | PASS |
| 8 | Authenticated request to an unknown page returns `404` | PASS |
| 9 | Authenticated request to an unknown API returns `404` | PASS |
| 10 | `/settings` redirects Facility Administrators to `/admin/organization`, others to default home | PASS |
| 11 | `/unit/[unitId]` and `/issues/[issueId]` match their policy and still fail object-level Facility checks | PASS |
| 12 | `TODAYS_WORK_ENABLED=false` withdraws `/today` for every role and removes it from navigation | PASS |
| 13 | Database A and Database B produce identical access, navigation, and Access Matrix output | PASS |
| 14 | Replayed permission-mutation Server Action returns `404` | PASS |

**Scenario 13 detail.** After normalizing seed-generated record identifiers, which differ between any
two databases, the full A/B result files were byte-identical — for the hostile matrix and again with
both legacy tables emptied. `/evs` and `/admin/takeover` returned `404` in Database B for every role
despite being present in `AppRoute` and granted in `RoleRoutePermission`. `/admin` remained
Facility-Administrator-only despite the rows saying the opposite. Navigation labels were unaffected by
`HOSTILE LABEL`, and the Access Matrix contained no `/evs` row and no hostile label.

No cookies, tokens, PINs, or connection strings were printed at any point. Both disposable databases
were dropped afterward. The existing local `ltc_manager` database was never migrated, seeded, or
written to during this phase.

## 9. Automated test coverage

| Suite | File | Tests |
| --- | --- | --- |
| Registry completeness and integrity | `platform-routes.test.ts` | 9 |
| Matching and boundary safety | `match.test.ts` | 12 |
| Role policy and fail-closed | `authorize.test.ts` | 20 |
| Navigation projection | `navigation.test.ts` | 10 |
| Access Matrix read-only behavior | `access-matrix.test.ts` | 8 |
| Legacy mirror parity and drift | `legacy-mirror.test.ts` | 9 |
| Internal link integrity | `link-integrity.test.ts` | 2 |

Completeness is enforced against reality: `platform-routes.test.ts` walks `src/app`, resolves route
groups and dynamic segments, and fails when a `page.tsx` or `route.ts` has no registry entry. A
second test injects a synthetic unregistered route to prove the check is not passing vacuously. A
third test fails on registry entries with no matching file, so the registry cannot accumulate phantom
policy. `link-integrity.test.ts` scans every literal internal `href`, `redirect()`, and
`router.push()` in `src` and fails if any points at a path that now fails closed.

Existing Wave 1, Today's Work, Knowledge, Issues, Inspections, and Business Workspace route tests were
rewritten to exercise the real registry through `roleMayAccessRoute` instead of a synthetic rule map,
and the Phase 1 authentication tests are unchanged and still pass.

## 10. Known limitations

- **Content links to gated routes.** The Workspace page renders links to `/today/walk` from a preview
  component that does not consult the feature flag. The route itself correctly redirects when the flag
  is off, so this is a cosmetic dead link, not an access issue. Primary navigation is correct.
- **Department scope for users without a department.** A user whose active operational department
  cannot be resolved is denied department-scoped routes (`/menus`, `/assets`, `/repairs`, `/issues`).
  This is pre-existing `NAV_DEPARTMENT_RULES` behavior, unchanged by this phase.
- **`Role.isActive` still gates sign-in.** Deactivating a `Role` row blocks login for users holding
  that role. It does not affect route authorization, and the product no longer offers any way to
  deactivate a role, but the column remains writable by direct database access.
- **Access Matrix shows page policy only.** API classification is developer-facing and lives in this
  document and in `buildAccessMatrix().apiGroups`.
- **`AppRoute` and `RoleRoutePermission` still exist.** Removal is deliberately deferred so this phase
  contains no destructive schema change.

## 11. Deferred findings

Not addressed in this phase and carried forward:

- Servery Ready and Meal Service Started milestone role authority
- Unit Workspace runtime error
- Cross-scope foreign-key findings
- Full session revocation
- Authentication rate-limiter cleanup scheduling
- Continuous integration
- Offline continuity
- Assignment activation
- Operations Engine activation
