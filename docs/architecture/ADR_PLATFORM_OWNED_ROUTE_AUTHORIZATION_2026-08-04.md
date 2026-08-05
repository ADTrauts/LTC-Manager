# ADR: Route Authorization Is Platform-Owned

- **Date:** 2026-08-04
- **Status:** Accepted for Version 1
- **Supersedes:** the 2026-05-05 decision to make route and navigation access database-backed through `AppRoute` and `RoleRoutePermission`
- **Related:** `docs/security/AUTHORIZATION_HARDENING_PHASE_2_2026-08-04.md`

## Context

Route authorization was resolved at runtime from two database tables:

- `AppRoute` — route prefix, label, navigation visibility, navigation order, active flag, critical flag
- `RoleRoutePermission` — a role × route allow matrix

Neither table has a `facilityId`. They are deployment-global. The `/admin/permissions` screen let any
Facility Administrator edit both tables through Server Actions (`setRoutePermissionAction`,
`cloneRolePermissionsAction`, `createRoleAction`, `updateRoleAction`).

Two structural findings followed from that design.

**CRIT-2 — cross-tenant authorization mutation.** One Facility Administrator, at one customer, could
change the role-to-route matrix for every facility in the deployment. Nothing in the schema or the
application scoped the edit to the editor's own facility.

**HIGH-1 — allow by default.** `resolveRouteAccess` returned `true` when no `AppRoute` prefix matched
the request path. Any authenticated user reached any path that had not been enumerated in the
database. A route added in code but not seeded into `AppRoute` was open to all six roles.

Both findings share one root cause: the authorization policy was *data*, not *code*. It could be
edited without review, it drifted from the routes that actually exist, and it silently degraded to
"allow" when the data was incomplete.

## Decision

**Route authorization policy is platform-owned and version controlled.**

A single canonical registry in application source (`src/lib/route-registry/platform-routes.ts`)
defines, for every page route and every API route, its authentication class, its allowed roles, its
feature gate, and its navigation metadata. The proxy, the navigation projection, the read-only
Access Matrix, and the compatibility seed data all read from that one registry. Runtime
authorization performs no database read.

### What Facility Administrators control

- Which users exist and which users are active
- Which platform role each user is assigned
- Which Facilities a user may access
- Which Departments a user may access
- Department membership, department heads, and department relationships
- Operational assignments, unit access, and responsibility
- Device and kiosk binding

### What Facility Administrators do not control

- What `FACILITY_ADMINISTRATOR`, `GM`, `MANAGER`, `SUPERVISOR`, `LEAD_TEAM_MEMBER`, and `STAFF` mean
- Which product routes each role can reach
- Which routes are public versus authenticated
- Which API classes are public, authenticated, or role-restricted
- Whether a role exists at all

Changing any of those requires a source change, code review, and a deployment.

## Why not Facility-owned permission matrices in Version 1

- **Cross-tenant safety.** A Facility-owned matrix is the only way to make per-customer editing safe,
  and adding `facilityId` to the route tables would have to be paired with per-facility resolution in
  the proxy, per-facility seeding, and per-facility migration of every future route. Until that exists,
  a shared editable matrix is a cross-tenant vulnerability, and building it is a large amount of work
  in service of a capability no customer has asked for.
- **Product consistency.** "Supervisor" should mean the same thing in every facility. When each
  customer can redefine it, the product no longer has roles — it has six labels.
- **Predictable training.** Onboarding material, in-product help, and role descriptions can only be
  written once if role capability is fixed.
- **Predictable support.** A support engineer can reason about a reported access problem from the
  source tree instead of having to inspect that customer's permission rows first.
- **Reduced onboarding burden.** A new facility does not have to make security decisions during setup.
  The defaults are the policy.
- **Stable role meaning across upgrades.** New routes inherit a reviewed platform classification
  rather than needing a per-customer grant decision.
- **Easier testing.** One policy can be tested exhaustively. N customer policies cannot.
- **Easier migration.** Route renames, splits, and removals are a code change plus a test, not a data
  migration across every tenant's matrix.
- **Avoiding one customer redefining the product's security model.** A customer that grants `STAFF`
  access to `/admin` has not configured the product; it has broken it, and the vendor still owns the
  outcome.

## Why not Organization-owned permission matrices in Version 1

- Facilities under one organization may have different operating-company and management-company
  relationships, so the organization is not reliably the right policy boundary.
- Organization ownership does not equal department operational ownership. The entity that owns the
  facility is frequently not the entity that runs Dietary or Plant Operations.
- The extra hierarchy level (platform → organization → facility) adds resolution, seeding, migration,
  and precedence rules that the first product does not need.
- It preserves the same problems at a different altitude: inconsistent role meaning, per-tenant drift,
  and untestable policy — just with a smaller blast radius.

## Consequences

- `AppRoute` and `RoleRoutePermission` become non-authoritative compatibility data. They are retained
  (see Phase 2 disposition) but nothing reads them at runtime.
- `/admin/permissions` becomes a read-only Access Matrix rendered from the registry.
- Unmatched paths fail closed instead of being allowed.
- Adding a route without registering it fails an automated check rather than silently shipping an
  open route.
- Genuine per-customer configuration needs must now be expressed through scope (Facility, Department,
  relationship, Assignment, device context) rather than through capability redefinition.

## When to reconsider

This is a Version 1 constitutional rule, not a permanent prohibition on all permission customization.
Revisit when any of the following is demonstrably true:

- A concrete, repeated customer need for **constrained capability grants** — narrow, platform-defined
  toggles (for example, "this facility's Supervisors may approve overtime") rather than free-form
  route matrices.
- **Enterprise contractual requirements** that mandate customer-administered access control, typically
  with an accompanying audit and attestation obligation.
- A **dedicated platform-policy governance model** exists: a platform-operator authority distinct from
  Facility Administrator, with change review, audit trails, and a rollback path.
- A **product design that separates fixed security capabilities from configurable workflow visibility**,
  so that customers can tune what a role *sees* and *does day to day* without being able to change
  what a role is *permitted* to reach.

Any such reconsideration should introduce customization as an additive, platform-constrained layer on
top of this registry — never by returning authorization resolution to editable database rows.

## The Version 1 rule

> Platform roles have stable, platform-owned capabilities.
> Operational scope remains configurable through Facility, Department, relationship, Assignment, and
> device context.
