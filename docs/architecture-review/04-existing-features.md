# 4. Existing Features

Maturity scale:

| Rating | Meaning |
|--------|---------|
| **Stub** | Route or placeholder exists; minimal or no functionality |
| **Prototype** | Core flow works; incomplete guards, UX, or edge cases |
| **Partial** | Usable for real workflows; known gaps documented |
| **Production-ready** | End-to-end with guards, schema, UI, and operational hardening |

---

## Authentication and session

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Email/password login | **Production-ready** | `/api/auth/login`, bcrypt, JWT cookie |
| Public signup (first admin) | **Production-ready** | `/signup`, `/api/auth/signup`, creates facility stack |
| PIN login (floor) | **Production-ready** | HMAC digest, device binding, rate limit, employee session |
| Session API | **Production-ready** | `/api/auth/session`, JWT refresh for active unit |
| Logout / full logout | **Production-ready** | Clears session; FA can unbind device |
| Device binding | **Production-ready** | `ltc_device_facility`, optional `ltc_device_unit` lock |
| Kiosk unit access warning | **Production-ready** | JWT flag, banner, `KioskUnitPinLoginEvent` audit |
| Password change | **Production-ready** | `/account` for email sessions |
| SSO / OAuth | **Stub** | Not implemented |

---

## Authorization, roles, permissions

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Role hierarchy | **Production-ready** | `RoleKey`, `access.ts`, proxy + server actions |
| DB route permission matrix | **Production-ready** | `AppRoute`, `RoleRoutePermission`, admin UI |
| Department-scoped nav | **Production-ready** | DIETARY / EVS / PLANT cookie + pathname allowlist |
| Onboarding gate | **Production-ready** | Proxy redirects incomplete FA to `/setup` |
| Credential policy by role | **Production-ready** | `credential-policy.ts` + tests |

---

## Onboarding and billing

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Guided setup wizard | **Production-ready** | `/setup`, `setup-wizard.tsx`, step APIs |
| Manager email capture | **Partial** | `OnboardingManagerInvite` stored; no automated email send |
| Initial unit creation | **Production-ready** | `/api/onboarding/locations` |
| Stripe card on file | **Production-ready** | SetupIntent, webhook, payment method default |
| Stripe without keys | **Partial** | Onboarding can complete when Stripe env vars empty |
| Subscription billing / invoicing | **Stub** | Payment method only; no plan models |

---

## Dashboard

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Global dashboard | **Production-ready** | Compliance cards, repairs, staffing, birthdays |
| Unit dashboard | **Production-ready** | `/unit/[unitId]` — menu, logs, servery controls |
| Post-onboarding checklist | **Partial** | Shown on dashboard for new facilities |
| District / multi-facility rollup | **Stub** | Explicitly deferred in memory-bank |

---

## Units (locations)

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Unit CRUD | **Production-ready** | `/units`, `units-manager.tsx`, server actions |
| Activation / ordering | **Production-ready** | `isActive`, `displayOrder` |
| Unit hierarchy (parent/child) | **Production-ready** | `parentUnitId` in schema and UI |
| Meal times per unit | **Production-ready** | `UnitMealTime` |
| Department responsibilities | **Production-ready** | `UnitDepartmentResponsibility` |
| DB-driven sidebar | **Production-ready** | `left-sidebar.tsx`, `getSidebarUnitsForSession` |
| Unit type configuration | **Production-ready** | `UnitType` enum, `unit-type-config.ts` |

---

## Logs (compliance checklists)

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Template builder | **Production-ready** | Create templates + typed fields |
| Template field types | **Production-ready** | 7 field types including temperature, pass/fail |
| Unit assignments | **Production-ready** | Recurrence, meal type, required role |
| Log submission | **Production-ready** | Submit flow with values + status |
| Submission history | **Production-ready** | History tab with filters |
| Attachments on submissions | **Partial** | Schema + lib; limited UI surface |
| Log template presets / seed | **Production-ready** | Seed + backfill script |
| Missed log automation | **Partial** | `MISSED` status exists; auto-detection unclear |

---

## Staffing and scheduling

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Default assignments | **Production-ready** | Per-employee standing assignments |
| Schedule grid | **Production-ready** | `/staffing`, date navigation, unit columns |
| Day-of overrides | **Production-ready** | `AssignmentOverride` with reason |
| Auto-assign | **Partial** | `staffing-auto-assign-form.tsx` — helper flow |
| Work shifts | **Partial** | `WorkShift` model; optional on schedule entries |
| Payroll / time clock | **Stub** | Not implemented |

---

## Employees and HR

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Employee directory | **Production-ready** | Cards, filters, sort, department tabs |
| Create / edit profile | **Production-ready** | Drawer + expanded card tabs |
| HR fields (union, CHRC, hire, stations) | **Production-ready** | Full schema + UI per memory-bank |
| Floor PIN management | **Production-ready** | GM-only PIN assign on employee card |
| Unit access restrictions | **Production-ready** | `EmployeeUnitAccess` |
| Discipline points | **Production-ready** | Entries + points summary report |
| Separations / terminations | **Production-ready** | Immutable records, separations page |
| HR audit log | **Production-ready** | Last 500 entries |
| CHRC report | **Production-ready** | Cleared vs not cleared |
| CSV import | **Production-ready** | Template, upsert, limits |
| Union handbook | **Production-ready** | PDF upload + API stream |
| Department heads | **Production-ready** | Admin + department settings |
| Rich exports (CSV/PDF reports) | **Stub** | Backlog in employee-hr-source-of-truth |
| Rehire workflow | **Stub** | `wouldRehire` field exists; no dedicated flow |

---

## Menus (dietary)

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Menu cycle settings | **Production-ready** | Cycle length, anchor, week start |
| Menu day builder | **Production-ready** | Week/day/meal period grid |
| Portions on items | **Production-ready** | `portionValue`, `portionUnit` |
| Menu on unit dashboard | **Production-ready** | Today's menu display |
| Production forecasting | **Stub** | Not implemented |

---

## Servery meal service

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Meal ready / started tracking | **Production-ready** | `ServeryMealServiceEvent`, unit controls |
| Dashboard integration | **Production-ready** | Global + unit dashboard cards |
| Per-meal daypart selector | **Production-ready** | Auto-select by local time window |

---

## EVS (environmental services)

| Feature | Maturity | Evidence |
|---------|----------|----------|
| EVS board | **Production-ready** | Room/zone status per unit for today |
| Status options | **Production-ready** | 7 operational statuses |
| Quick repair ticket from EVS | **Production-ready** | `createEvsRepairTicketAction` |
| EVS department nav isolation | **Production-ready** | No `/repairs` link; create via board |

---

## Assets and vendors

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Asset registry | **Production-ready** | Code, type, unit, department, status |
| Vendor registry | **Production-ready** | Sub-tab on `/assets?subtab=vendors` |
| Asset status updates | **Production-ready** | ACTIVE / OUT_OF_SERVICE / RETIRED |
| Department on assets | **Production-ready** | Routing department field |

---

## Repairs and maintenance

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Corrective work orders | **Production-ready** | Create, priority, status, updates |
| Repair routing by department | **Production-ready** | `repair-routing.ts`, trade + unit hints |
| Preventive maintenance schedules | **Partial** | Schema + repairs linkage; PM UI on repairs page |
| Repair attachments | **Partial** | Schema + lib; limited UI |
| Vendor on repairs | **Production-ready** | Optional vendor link |
| Assigned employee | **Production-ready** | `assignedEmployeeId` |

---

## Reports

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Date range filters | **Production-ready** | Start/end, unit, repair status |
| Log compliance report | **Production-ready** | Assignment vs submission coverage |
| Temperature failures | **Production-ready** | Failed submissions section |
| Repairs report | **Production-ready** | Status breakdown |
| Staffing coverage | **Production-ready** | Schedule vs overrides |
| Export / PDF | **Stub** | In-app tables only |

---

## Admin

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Admin hub | **Production-ready** | `/admin` index |
| Departments admin | **Production-ready** | Visibility toggle, department heads |
| Permissions matrix | **Production-ready** | FA edits role × route |
| Organization settings | **Production-ready** | Name, brand color, handbook, device bind |
| Lookup tools (future) | **Stub** | Admin page notes more tools coming |

---

## Inventory, messaging, tasks

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Inventory | **Stub** | No routes or models |
| Messaging | **Stub** | No routes or models |
| Generic tasks | **Stub** | Logs and repairs cover adjacent workflows only |
| Notifications | **Stub** | Not implemented |

---

## Infrastructure features

| Feature | Maturity | Evidence |
|---------|----------|----------|
| Facility provisioning CLI | **Production-ready** | `db:provision` script |
| Demo seed | **Production-ready** | `prisma/seed.mjs` |
| Telemetry events | **Prototype** | `telemetry.ts` — lightweight, not full analytics |
| Multi-instance PIN rate limit | **Partial** | In-memory only; Redis noted as future need |
| Object storage for uploads | **Partial** | Local `uploads/` directory |

---

## Feature count summary

| Maturity | Approximate count |
|----------|-------------------|
| Production-ready | ~45 feature areas |
| Partial | ~10 |
| Prototype | ~1 |
| Stub | ~10 |

The codebase is **past Phase 0 scaffold**. Core dining operations modules are implemented to a usable MVP standard.
