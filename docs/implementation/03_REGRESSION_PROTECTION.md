# Regression Protection

**Status:** Per-wave validation and rollback guide  
**Date:** 2026-07-07

Every modernization wave **ends with validation**. This document defines critical workflows, breakage risk, manual tests, compatibility rules, rollback strategy, and success metrics per wave.

**Baseline test environment:** Local dev with seeded facility (`npm run db:seed` in `ltc-manager/`) or provisioned test facility. Test with at least three roles: **FACILITY_ADMINISTRATOR**, **SUPERVISOR**, **STAFF (PIN)**.

Reference smoke doc: `docs/self-serve-smoke-test.md`

---

## Global critical workflows (all waves)

These must pass after **every** wave:

| ID | Workflow | Roles | Steps |
|----|----------|-------|-------|
| G-01 | Email login | FA, Manager | Login → lands on correct home → session persists |
| G-02 | PIN login | Staff | PIN on bound device → unit access → logout |
| G-03 | Onboarding gate | FA incomplete | Incomplete onboarding redirects to `/setup` |
| G-04 | Route permission deny | Staff | Staff cannot access `/admin` |
| G-05 | Department scope | Manager | Switch dietary ↔ EVS → nav allowlist changes |
| G-06 | Kiosk unit lock | Staff | Locked device shows banner; unit scope enforced |
| G-07 | Log submit | Staff | Open unit → submit assigned log → appears in history |
| G-08 | Staffing view | Supervisor | Open staffing grid → see schedule for today |
| G-09 | Repair create | Supervisor | Create repair → appears in list with status |
| G-10 | Facility scope | All | No cross-facility data in UI (single-facility deploy) |

---

## Wave 1 — Application Shell & Navigation

### Critical workflows

| ID | Workflow | Risk if broken |
|----|----------|----------------|
| W1-01 | Manager sees Operations Center zone as home | Managers lost on login |
| W1-02 | Staff/PIN sees Locations or locked unit | Floor cannot work |
| W1-03 | All 12 seeded routes reachable by permitted role | Feature lockout |
| W1-04 | Department switcher filters without hiding critical routes | EVS/dietary cross-contamination |
| W1-05 | Admin zone reachable only by FA/GM | Security |
| W1-06 | Review (`/reports`) reachable from Review zone | Reporting lost |
| W1-07 | Proxy rejects unauthorized paths | Auth bypass |

### Areas likely to break

- `src/lib/department-nav.ts` pathname allowlists
- `src/proxy.ts` department + RBAC checks
- `prisma/seed.mjs` route order — nav sequence wrong
- Kiosk: employee may see manager nav if role gate wrong
- Deep links bookmarked by users (old labels)

### Manual testing required

- [ ] Login as FA → verify five zones visible or labeled
- [ ] Login as Supervisor → verify Today's Work prep (route may 404 until Wave 4 — hide or placeholder OK)
- [ ] PIN login as Staff → minimal nav, unit workspace reachable
- [ ] Switch department cookie → dietary vs EVS nav differs
- [ ] Hit every top-nav link — no 403 for entitled role
- [ ] Mobile width — nav usable
- [ ] Run `src/lib/route-permissions.test.ts`, `credential-policy.test.ts`

### Backward compatibility

- **Preserve** all existing URL paths (`/dashboard`, not only `/operations`)
- **Preserve** `AppRoute.pathPrefix` values — add aliases, do not remove
- **Preserve** department cookie name `ltc_active_department`
- Bookmarks to `/dashboard` must work indefinitely

### Rollback strategy

1. Revert shell component commits (`app-shell`, `top-nav`, `left-sidebar`)
2. Revert `department-nav.ts` and `route-permissions.ts`
3. Re-run seed if `AppRoute` labels changed: `npx prisma db seed`
4. No schema rollback required if no migration

### Success metrics

- Zero increase in 403 errors for entitled roles (manual spot check)
- All G-01 through G-10 pass
- Nav zone identifiable in user testing (3 users, 30 seconds each)

---

## Wave 2 — Operations Center

### Critical workflows

| ID | Workflow |
|----|----------|
| W2-01 | Dashboard shows exception cards before secondary content |
| W2-02 | Meal period banner matches servery state |
| W2-03 | Drill-down from blocked unit → unit page |
| W2-04 | Log compliance numbers match `/logs` history |
| W2-05 | Open repair count matches `/repairs` |
| W2-06 | Staffing gap card matches `/staffing` for same date |

### Areas likely to break

- Dashboard query performance (N+1 aggregations)
- Card order regression hiding birthdays/checklist unintentionally
- Dietary vs EVS mode showing wrong card set
- Empty state when no units configured

### Manual testing required

- [ ] Seed facility with mixed unit states → verify pulse counts
- [ ] Failed log submission → appears in exceptions within refresh
- [ ] HIGH priority open repair at unit → exception visible
- [ ] Compare report page numbers to dashboard cards (same date range)
- [ ] New facility post-onboarding checklist still visible (lower priority)

### Backward compatibility

- `/dashboard` URL unchanged
- Existing dashboard sections remain reachable (may reorder)
- API routes unchanged

### Rollback strategy

1. Revert `dashboard/page.tsx` and new `operations-center/` lib
2. No migration rollback

### Success metrics

- Manager 60-second test ([FIRST_PRODUCT_SLICE](../platform-vision/FIRST_PRODUCT_SLICE.md)): 5 questions answerable from Operations Center
- Exception cards load in &lt; 3s on seeded facility

---

## Wave 3 — Unit Workspace

### Critical workflows

| ID | Workflow |
|----|----------|
| W3-01 | PIN user completes log from unit page |
| W3-02 | Servery meal ready/started from unit |
| W3-03 | Today's menu displays for dietary unit |
| W3-04 | Open issues visible on unit with open repair |
| W3-05 | Kiosk locked unit — cannot switch location without FA |

### Areas likely to break

- Log submit form embedded in new layout
- Servery controls on small tablet viewport
- Unit page load time with menu + logs + repairs queries

### Manual testing required

- [ ] PIN session on servery unit — full flow G-07 + servery
- [ ] Unit with no assignments — empty state, no crash
- [ ] Supervisor email session — same page, more context OK
- [ ] Parent/child unit hierarchy — correct unit context

### Backward compatibility

- `/unit/[unitId]` URL unchanged
- All existing server actions on unit page preserved

### Rollback strategy

1. Revert `unit/[unitId]/page.tsx` layout commits
2. Keep readiness chips if from Wave 6 — isolate component

### Success metrics

- Floor worker completes log + servery in &lt; 60 seconds (FIRST_PRODUCT_SLICE)
- No regression in G-07

---

## Wave 4 — Supervisor & Today's Work

### Critical workflows

| ID | Workflow |
|----|----------|
| W4-01 | Supervisor opens walk list — all active units |
| W4-02 | Walk list ordered by attention (blocked first) |
| W4-03 | Coverage view links to staffing with context |
| W4-04 | Create assignment override as call-down |
| W4-05 | Open call-down appears on Operations Center |

### Areas likely to break

- New route not in seed permissions → 403
- Supervisor vs Manager permission differences
- Staff accidentally sees Today's Work

### Manual testing required

- [ ] Supervisor login → `/today` accessible
- [ ] Staff login → `/today` denied
- [ ] Create override with call-down reason → list updates
- [ ] Walk list drill-down to unit works

### Backward compatibility

- `/staffing` unchanged — Today's Work links in, does not replace
- Override records compatible with reports staffing section

### Rollback strategy

1. Remove `/today` routes and seed entries
2. Revert proxy allowlist
3. Operations Center call-down card hides if no data source

### Success metrics

- Supervisor identifies top 3 walk destinations in &lt; 30 seconds
- G-08 still passes

---

## Wave 5 — Operations Engine

### Critical workflows

| ID | Workflow |
|----|----------|
| W5-01 | Active operation resolves for current meal period |
| W5-02 | Logs filter by active operation |
| W5-03 | Servery events associate with operation instance |
| W5-04 | Historical dates show correct past operations |

### Areas likely to break

- Migration on production data
- Backfill missing instances for past dates
- Timezone edge cases at midnight/meal boundaries
- Logs due "now" wrong operation scope

### Manual testing required

- [ ] Migration on copy of prod schema
- [ ] Breakfast/lunch/dinner transitions (mock time or seed data)
- [ ] Operations Center header matches operation resolver
- [ ] Run full G-01–G-10

### Backward compatibility

- Existing `LogAssignment.mealType` preserved
- Servery events without `operationInstanceId` — backfill or nullable FK
- UI works when operation engine disabled (feature flag)

### Rollback strategy

1. Feature flag off — fall back to meal-type-only composition
2. Forward migration revert only if wave not deployed; else forward-fix migration
3. **Never** `prisma migrate reset` on production

### Success metrics

- 100% of today's servery units map to an operation instance
- Zero log submission failures attributable to operation scope

---

## Wave 6 — Readiness Engine

### Critical workflows

| ID | Workflow |
|----|----------|
| W6-01 | Readiness chip on sidebar for each active unit |
| W6-02 | Blocked = failed required log OR HIGH/URGENT repair OR zero staffing |
| W6-03 | Site pulse on Operations Center matches unit aggregate |
| W6-04 | EVS room status contributes in EVS mode (if scoped) |

### Areas likely to break

- False blocked — operational noise
- False complete — missed risk
- Performance on sidebar (readiness per unit query)

### Manual testing required

- [ ] Unit tests for `blocked-rules.ts` — all rule branches
- [ ] Seed: failed sanitizer log → unit blocked
- [ ] Seed: open URGENT repair → unit blocked
- [ ] Seed: empty schedule at servery → unit blocked
- [ ] Complete unit → green/chip Complete

### Backward compatibility

- Readiness is additive — existing pages work without chips
- v0 computed readiness requires no schema

### Rollback strategy

1. Remove chip component from sidebar and dashboard
2. Delete readiness lib — no user data loss

### Success metrics

- Blocked rules match FIRST_PRODUCT_SLICE definitions
- Sidebar renders in &lt; 2s for 20 units

---

## Wave 7 — Work Engine

### Critical workflows

| ID | Workflow |
|----|----------|
| W7-01 | Log submit creates identically behaving submission |
| W7-02 | Repair create/update unchanged for users |
| W7-03 | Task record synced on log/repair create |
| W7-04 | Inspection submit (new) creates Task + Inspection |
| W7-05 | Log history tab unchanged |

### Areas likely to break

- Dual-write log/repair + task inconsistency
- Transaction failures mid-submit
- Inspection cadence from unit responsibilities

### Manual testing required

- [ ] Full log template lifecycle: create template → assign → submit → history
- [ ] Full repair lifecycle: create → update status → close
- [ ] Create inspection from unit with cadence metadata
- [ ] DB spot check: Task rows match submissions/repairs count (new records)

### Backward compatibility

- **Mandatory:** Log and Repair tables remain source of truth for compliance
- Task is additive until explicitly switched
- No removal of `/logs` or `/repairs` routes

### Rollback strategy

1. Stop Task sync in actions (feature flag)
2. Drop Task tables only if no production dependency — prefer leaving orphaned tasks
3. Never delete LogSubmission or Repair records

### Success metrics

- G-07, G-09 pass
- Zero duplicate submissions on retry

---

## Wave 8 — Issue & Recovery

### Critical workflows

| ID | Workflow |
|----|----------|
| W8-01 | Create equipment issue from unit (&lt; 30s) |
| W8-02 | Create supply short issue |
| W8-03 | EVS board quick ticket still works |
| W8-04 | Repair routing by department unchanged |
| W8-05 | Issue detail page (SCR-06) shows lifecycle |
| W8-06 | Readiness blocked on HIGH/URGENT issues |

### Areas likely to break

- `repair-routing.ts` with new issue types
- Reports repairs section filters
- EVS isolation (no `/repairs` link in EVS nav)

### Manual testing required

- [ ] Unit quick form → issue on dashboard
- [ ] Supply short → dietary manager queue
- [ ] EVS create ticket from board
- [ ] Close issue → readiness updates
- [ ] Attachments on issue (if UI in scope)

### Backward compatibility

- Existing `Repair` rows default to EQUIPMENT type
- `/repairs` URL works — may rename label to Issues gradually
- Reports repair report includes new types

### Rollback strategy

1. Revert issue type column migration via forward migration (nullable)
2. Hide quick forms — repairs page still works

### Success metrics

- FIRST_PRODUCT_SLICE floor test: report problem in &lt; 30 seconds
- G-09 pass with new forms

---

## Wave 9 — Knowledge Layer

### Critical workflows

| ID | Workflow |
|----|----------|
| W9-01 | Union handbook upload + stream/download |
| W9-02 | Log template instruction visible on submit |
| W9-03 | Knowledge article attached to unit appears in workspace |
| W9-04 | Department-scoped knowledge not visible cross-dept |

### Areas likely to break

- File upload paths (`facility-uploads.ts`)
- Handbook API regression
- Large PDF performance

### Manual testing required

- [ ] Upload handbook → download via API
- [ ] Attach SOP to template → visible on log submit
- [ ] Search knowledge by keyword
- [ ] PIN user sees only unit-relevant knowledge

### Backward compatibility

- Handbook fields on Facility preserved
- Existing handbook URLs work

### Rollback strategy

1. Hide knowledge UI — handbook API untouched
2. Drop knowledge tables if empty

### Success metrics

- Handbook smoke test passes
- No upload path traversal regression

---

## Wave 10 — Operational AI

### Critical workflows

| ID | Workflow |
|----|----------|
| W10-01 | AI disabled by default — no API calls |
| W10-02 | AI enabled → brief generates without blocking page |
| W10-03 | AI failure → graceful empty state |
| W10-04 | No employee PII in prompts (policy check) |

### Areas likely to break

- Dashboard load time waiting on LLM
- Cost runaway if flag misconfigured
- Hallucinated operational facts

### Manual testing required

- [ ] Flag off — no network to AI provider
- [ ] Flag on — brief ≤ 3 sentences, matches seed data roughly
- [ ] Disconnect API key — dashboard still loads
- [ ] Review audit log entries

### Backward compatibility

- Purely additive card on Operations Center
- Remove flag → identical to pre-wave behavior

### Rollback strategy

1. Remove AI env vars and UI card
2. No schema required

### Success metrics

- Dashboard LCP unchanged with AI off
- Zero blocking errors with AI on

---

## Wave 11 — Organization & Multi-site Foundation

### Critical workflows

| ID | Workflow |
|----|----------|
| W11-01 | Single-facility deploy behaves identically |
| W11-02 | Org admin switches site — data changes, no leak |
| W11-03 | User in site A cannot query site B data |
| W11-04 | Onboarding creates org + first site |
| W11-05 | PIN login scoped to correct site |

### Areas likely to break

- Every `facilityId` query
- JWT session shape
- Stripe customer mapping
- Seed and provision scripts

### Manual testing required

- [ ] Two facilities one org — switcher isolation test
- [ ] Automated test: cross-site ID in URL returns 404/403
- [ ] Full G-01–G-10 on each site
- [ ] Provision script creates org stack

### Backward compatibility

- Existing single facilities get default org record in migration
- `facilityId` remains on all operational rows (ADL-003 unwind gradual)
- Session without org claim defaults to single-site mode

### Rollback strategy

1. **High risk** — test migration on staging clone first
2. Feature flag site switcher off — single facility mode
3. Forward migration to remove org FK if needed — never reset prod

### Success metrics

- Zero cross-site data in manual penetration spot check
- Single-site regression suite 100% pass

---

## Wave 12 — Industry Configuration Layer

### Critical workflows

| ID | Workflow |
|----|----------|
| W12-01 | LTC pack — identical behavior to pre-wave |
| W12-02 | Second pack in dev — different department labels |
| W12-03 | Department nav driven by config not hardcoded keys |
| W12-04 | Log presets apply per industry on provision |
| W12-05 | EVS board works in LTC pack |

### Areas likely to break

- `department-nav.ts` allowlists
- `ensure-default-departments.ts` seed
- EVS/Dietary/Plant routing throughout app
- Admin department visibility toggles

### Manual testing required

- [ ] Provision LTC facility — full smoke test
- [ ] Provision K-12 (or mock) facility — nav differs, core flows work
- [ ] Switch industry on dev facility — documented limitation if unsupported
- [ ] Run full global G-01–G-10 on LTC pack

### Backward compatibility

- Existing facilities default to `LTC` industry profile in migration
- Prisma enum names unchanged (ADL-006)
- Department `key` slugs stable per facility

### Rollback strategy

1. Force LTC profile in code path
2. Revert data-driven nav to hardcoded allowlists

### Success metrics

- LTC pack: bit-for-bit workflow parity with pre-Wave-12 baseline
- Second pack: demonstrable in dev environment

---

## Validation checklist template (every wave)

Copy into wave completion report:

```markdown
## Validation — Wave N

### Automated
- [ ] `npm test` (or project test command) — pass
- [ ] `npm run lint` — pass (if configured)
- [ ] Typecheck — pass

### Global workflows G-01–G-10
- [ ] All pass (list exceptions)

### Wave-specific WN-*
- [ ] (from this document)

### Regression notes
- (issues found and fixed)

### Sign-off
- Wave: N
- Git milestone: wave-0N-*
- Date:
```
