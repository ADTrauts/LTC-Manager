# 7. Architecture Assessment

Evaluation of the **current** system only. No recommendations for changes.

---

## Current strengths

### 1. Clear tenancy and scoping model

`Facility` is consistently applied across users, units, employees, templates, and vendors. Session JWT carries `facilityId`; proxy rejects sessions without it. Queries and server actions follow facility scope. This is a solid foundation for single-facility deployments.

### 2. Unit-driven UX matches domain

The product's differentiator — multi-node LTC dining — is reflected in architecture: units are admin-created, sidebar is DB-driven, and per-unit dashboards are first-class. Unit names are not hardcoded.

### 3. Mature compliance log framework

Template → assignment → submission is a flexible, extensible pattern. Field types cover temperature and pass/fail use cases. The same framework supports dietary, EVS, and plant ops logs via department scoping.

### 4. Dual auth model fits operations

Email sessions for management laptops and PIN sessions for floor tablets map cleanly to `User` vs `Employee`. Device binding, unit lock, and kiosk audit events show intentional hardware workflow design.

### 5. DB-driven permissions

`AppRoute` + `RoleRoutePermission` allow FA to tune access without code deploys. Fallback role minimums prevent total lockout if matrix is incomplete.

### 6. Department as routing dimension

Departments connect units, employees, assets, repairs, and nav scoping. EVS repair submission without exposing full repairs module demonstrates thoughtful cross-module rules.

### 7. Server-first Next.js pattern

Server Components + co-located Server Actions keep most business logic on the server. No complex client state synchronization. Fits operational CRUD and form-heavy workflows.

### 8. Documented institutional memory

`memory-bank/` provides architecture decisions, phase history, HR source of truth, and runbooks. Reduces bus factor for agents and developers.

### 9. Incremental schema evolution

31 forward migrations show phased delivery without big-bang rewrites. Immutable termination records and HR audit logs show data integrity awareness.

### 10. Separation of servery timing from compliance logs

`ServeryMealServiceEvent` avoids overloading log submissions for operational meal ready/started moments — a deliberate modeling choice documented in architecture-decisions.

---

## Current weaknesses

### 1. Monolith concentration

All features live in one Next.js app. No background workers, queue, or separate services for webhooks, email, or scheduled jobs (e.g. missed log detection).

### 2. In-memory rate limiting

PIN brute-force protection does not survive process restarts or scale horizontally without external store.

### 3. Local filesystem uploads

Union handbook and attachments use local `uploads/` paths. Documented as v1 limitation; not suitable for serverless multi-instance without shared storage.

### 4. Limited automated test coverage

Only two lib unit test files observed. No E2E suite. Quality gates rely on typecheck, lint, build, and manual smoke tests.

### 5. No observability stack

`telemetry.ts` is lightweight event logging, not structured APM, error tracking, or audit for all mutations.

### 6. Manager invite capture without delivery

`OnboardingManagerInvite` persists emails but no email service integration exists.

### 7. Stripe integration is setup-only

Card on file for onboarding completion — no subscription, invoice, or usage billing models.

### 8. Reports are read-only tables

No export, scheduling, or visualization layer. Operational reporting exists but not as a reporting product.

### 9. Component reuse is thin

Beyond shell, drawer, and CSS utilities, features build custom markup. Increases consistency risk as modules grow.

### 10. Next.js 16 proxy convention

Using `proxy.ts` instead of `middleware.ts` is correct for this version but may surprise developers familiar with older Next patterns.

---

## Technical debt

| Item | Severity | Notes |
|------|----------|-------|
| `module-placeholder.tsx` unused | Low | Legacy Phase 0 artifact |
| `package.json#prisma` seed config deprecated | Low | Documented in architecture-decisions |
| Prisma pinned to v6 | Low | Intentional stability choice |
| PIN digest tied to `AUTH_SECRET` | Medium | Secret rotation invalidates all PINs |
| Menu DB defensive loader | Medium | `loadFacilityMenuData` guards stale client — symptom of generate/restart coupling |
| Legacy `/employees/terminations` redirect | Low | Compatibility shim |
| `showInEmployeeApp` edge cases | Low | Hidden departments still appear in profile dropdown when assigned |
| Global unique `Asset.assetCode` | Medium | Not facility-scoped; could collide in true multi-tenant hosting |
| Global unique `Repair.repairCode` | Medium | Same as asset codes |
| Inconsistent attachment UI | Medium | Schema exists; UI surface limited |

---

## Coupling

### Tight coupling (intentional)

- **Pages ↔ Prisma:** Server Components query Prisma directly; no repository layer.
- **Features ↔ facility scope:** Nearly every query includes `facilityId`.
- **Nav ↔ database:** `AppRoute` seeds must align with actual routes in `src/app/`.
- **Department keys ↔ code:** `department-nav.ts` references keys like `DIETARY`, `EVS`, `PLANT` — new departments require code updates for nav rules.

### Moderate coupling

- **Server actions ↔ lib helpers:** Good extraction into `src/lib/` but actions remain large in places (employees, units).
- **Repairs ↔ EVS:** EVS page imports repair actions directly.
- **Logs ↔ menus:** Menu context integrated into logs page for meal-linked assignments.

### Loose coupling (positive)

- **Stripe:** Isolated in `stripe.ts` + API routes.
- **PIN/auth:** Contained in `auth.ts`, `pin.ts`, API routes.
- **Route permissions:** Cached layer decouples proxy from raw Prisma on every request (30s TTL).

### Missing abstraction layers

- No domain service layer between pages and Prisma.
- No event bus or domain events for cross-module reactions (e.g. termination → schedule cleanup).
- No API versioning — UI and API routes evolve together.

---

## Scalability

### What scales reasonably

- **Single facility operational load:** Staff count, units, daily log volume, schedule rows — PostgreSQL handles this scale easily.
- **Read-heavy dashboards:** Server-rendered per request; acceptable for facility-sized user counts.
- **Schema normalization:** Proper indexes on common query paths (`facilityId`, dates, unitId).

### What does not scale as-is

- **Multi-facility SaaS on one DB:** Schema supports `facilityId` but product, analytics, and global unique codes are single-facility oriented.
- **Horizontal app instances:** PIN rate limit, route permission cache, and local uploads assume single instance or sticky sessions.
- **High-frequency real-time updates:** No WebSockets; pages use `noStore()` and full server re-renders.
- **Large file volumes:** Local disk storage for uploads.
- **Background processing:** No job queue for imports, reports, or notifications.

---

## Areas that should be preserved

These patterns are embedded in working code and product fit — any future work would likely build on them rather than replace them:

1. **Facility-scoped tenancy** with JWT `facilityId`.
2. **Unit as the operational navigation primitive** (sidebar, active unit, unit dashboards).
3. **Log template → assignment → submission** compliance pipeline.
4. **Employee roster separate from User accounts** with PIN floor auth.
5. **Department-scoped operational nav** for DIETARY / EVS / PLANT.
6. **DB-driven route permissions** for FA-configurable access.
7. **Server Actions + Server Components** server-first data flow.
8. **Immutable HR artifacts** (termination records, audit log).
9. **Device binding + optional unit lock** for kiosk tablets.
10. **memory-bank documentation** as living architecture record.
11. **Prisma schema as domain source of truth** with forward-only migrations.
12. **CSS design tokens** in `globals.css` for consistent operational UI.

---

## Security posture (observed)

| Control | Present |
|---------|---------|
| HttpOnly session cookie | Yes |
| bcrypt password hashing | Yes |
| PIN HMAC (not plaintext storage) | Yes |
| Proxy auth on protected routes | Yes |
| Role checks in server actions | Yes (in mature modules) |
| CSRF on Server Actions | Next.js default |
| Rate limit on PIN | Yes (in-memory) |
| Stripe webhook signature verification | Yes (when configured) |
| Field-level HR audit | Yes |
| Content Security Policy / security headers | Not observed in next.config |

---

## Architecture style summary

| Dimension | Characterization |
|-----------|------------------|
| Pattern | Modular monolith (Next.js full-stack) |
| Data access | Prisma ORM, direct from server layer |
| Auth | Custom JWT + cookies |
| Multi-tenancy | Single-facility per deployment (schema-ready for more) |
| Integration | Stripe only (external) |
| Async processing | None |
| Caching | In-memory (route permissions, 30s) |
| File storage | Local filesystem |

The architecture is **appropriate for an MVP targeting single-facility LTC dining operations** with room to grow modules within the same monolith. It is **not yet architected as multi-tenant SaaS** or a platform with heavy async/integrations.
