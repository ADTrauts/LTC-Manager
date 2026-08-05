# Runtime Hardening Phase 3 — Unit Workspace and Service Milestone Integrity

Date: 2026-08-04
Branch: `security/runtime-hardening-phase-3-2026-08-04`
Preceded by: [Authorization Hardening Phase 2](./AUTHORIZATION_HARDENING_PHASE_2_2026-08-04.md)

Phase 3 addresses three pilot blockers: the Unit Workspace returning HTTP 500, the absence of any
role check on the service-milestone write, and the milestone record's inability to survive a
duplicate press, a shared tablet, or a correction.

---

## 1. Pilot Blocker 1 — Unit Workspace HTTP 500

### Root cause

`src/components/servery-meal-service-controls.tsx` initialised its selected meal with a non-null
assertion on the first configured serving time:

```ts
const [selectedMeal, setSelectedMeal] = useState<MealType>(() => {
  if (slots.some((s) => s.mealType === defaultMealType)) return defaultMealType;
  return slots[0]!.mealType;
});
```

For a `SERVERY` unit with no active `UnitMealTime` rows, `slots` is empty, `slots[0]` is
`undefined`, and the assertion turns a type error into a runtime one:
`TypeError: Cannot read properties of undefined (reading 'mealType')`. The component is rendered
during server rendering of `/unit/[unitId]`, so the throw became a 500 for the whole page — the
unit context, assignments, assets, logs, and issues all disappeared along with the meal buttons.

The guard that would have prevented it (`if (orderedSlots.length === 0)`) sat *below* the
`useState` call and therefore never ran.

Reproduced before the fix as HTTP 500 on a `SERVERY` unit with zero active serving times, and on a
unit whose serving times had all been deactivated. Units of other types were unaffected, because
the component is only rendered for `SERVERY`.

### Fix

The selected meal is now `MealType | null`, seeded from `slots[0]?.mealType ?? null`, and the empty
case returns a fallback panel before any meal-dependent code runs. Nothing reads past the end of
the array, with or without an assertion.

### Meal-service states

`src/lib/servery/meal-service-context.ts` replaces "pick a default meal, always" with a
discriminated union. Variants that name a meal carry a valid `MealType`; variants that cannot name
one have no `mealType` field at all, so a null meal is not representable rather than merely
unlikely.

| State | Meaning | Milestone action |
| --- | --- | --- |
| `ACTIVE` | A configured meal is within an hour either side of its serving time | Available |
| `UPCOMING` | No meal active; the first meal of the day is still ahead | Available for the next meal |
| `BETWEEN` | A meal has finished and another remains today | Available for the next meal |
| `DAY_COMPLETE` | Every configured meal for the operational day has passed | Available for the last meal |
| `NOT_CONFIGURED` | No active serving times, or times that cannot be parsed | None; the panel says configuration is missing |
| `NOT_APPLICABLE` | The unit does not run the Dietary meal-service workflow | None |

The important distinction is between `NOT_CONFIGURED` and every other state. Previously,
`pickDefaultMealTypeForUnitSlots` returned `BREAKFAST` for a servery with no configuration at all,
which invented a meal occurrence for a line that serves none. `NOT_CONFIGURED` now says so.

The fallback creates nothing: no `UnitMealTime` row, no `OperationDefinition`, no
`ServeryMealServiceEvent`. It reports what is missing and directs the operator to the Units page.

Unit, assignment, asset, log, and issue context continue to render in every state.

---

## 2. Pilot Blocker 2 — Milestone authority

### Root cause

`recordServeryServiceTimeAction` called `requireFacilitySession()` and nothing else. Every other
mutating action in the same file called `requireAtLeastRole`. Any authenticated session in the
facility — including a PIN session for an employee in an unrelated department, on a tablet bound to
a different servery — could record either milestone for any active `SERVERY` unit in the facility.

### Decision

Authority is decided in one pure function, `decideServeryMilestoneAuthority` in
`src/lib/servery/milestone-authority.ts`. It takes facts and returns a decision, so the same rules
serve both the write path and the interface, and the whole matrix is testable without a database.

Recording requires **all** of:

- a supported operational role;
- the Unit resolving inside the session Facility;
- the Unit running the Dietary meal-service workflow;
- an active Dietary Department in that Facility;
- an actor holding a Dietary Department relationship (primary department, `EmployeeDepartment`, or
  department headship);
- an actor who is not terminated;
- Unit authority, which `STAFF` and `LEAD_TEAM_MEMBER` must hold explicitly (an
  `EmployeeUnitAccess` row, their primary unit, or an unrestricted empty access list) and which
  `SUPERVISOR` and above derive from Facility and Department scope;
- agreement between the target Unit and the Unit a locked tablet is bound to.

Correcting additionally requires `SUPERVISOR` or above, and a reason.

Two consequences are deliberate:

**A PIN session grants no additional authority.** `authMethod` is recorded for provenance and is
never consulted by the decision. A test asserts the decision is byte-identical for `PASSWORD` and
`QUICK_PIN` across every role.

**Facility Administrator status alone is not frontline authority.** Administering accounts is not
the same as working a servery line, so a Facility Administrator without a Dietary relationship is
refused like anyone else.

An out-of-scope Unit is reported as `UNIT_NOT_FOUND`, not as a permission failure, so another
facility's Unit identifiers are not confirmed by probing.

---

## 3. Pilot Blocker 3 — Milestone record integrity

### What the old model could not express

The `ServeryMealServiceEvent` row held only the occurrence time and a `User` foreign key, and the
action wrote it with a bare `upsert`. That produced five distinct defects:

1. **No actor for PIN sessions.** `sessionUserIdForFk` returns `null` for a PIN session, so the
   shared-tablet case the workflow exists to serve recorded no actor at all.
2. **Silent overwrite.** A second press replaced the first recorded time and the original was gone.
3. **No idempotency.** A double tap, a retried submission, or a reconnecting tablet each produced a
   fresh write.
4. **No correction history.** A fix was indistinguishable from an original entry.
5. **Occurrence and entry time conflated.** A late entry looked exactly like a late meal.

The service date also came from `startOfToday()`, which uses server local time rather than the
facility timezone.

### Model

`ServeryMealServiceEvent` remains the current-state projection, so the four existing readers
(dashboard, Unit Workspace today, Unit Workspace history, logs) keep working without reducing an
event log themselves. It gains employee attribution, credential surface, and a server acceptance
time for each milestone.

`ServeryMilestoneEntry` is new and append-only. The product never updates or deletes a row in it. A
correction appends a `CORRECTION` entry carrying `previousOccurredAt`, so the original occurrence
time, actor, and acceptance time all survive.

Migration `20260804220000_servery_milestone_integrity` is additive: it drops no column, deletes no
row, and overwrites no value. It backfills an `ORIGINAL` entry for every milestone already
recorded, deterministically keyed from the event id and guarded by `ON CONFLICT DO NOTHING`, so
re-running is a no-op. Backfilled entries leave `actorRole`, `authMethod`, and the new
`*RecordedAt` columns null: that information was never captured, and inferring it would fabricate
audit data.

Verified on a fresh database (62 migrations, zero rows) and on a seeded database holding legacy
event rows, including one with a milestone recorded and no actor. Original values were unchanged in
both cases.

### Timing

`occurredAt` is when the milestone happened; `recordedAt` is when the server accepted it. Both are
server-generated for an ordinary press. A correction supplies `occurredAt` and the server still
sets `recordedAt`. A future `occurredAt` is refused.

The service date now comes from `getFacilityServiceDate(facilityTimezone, now)` rather than server
local midnight, so a facility in another timezone files a milestone against the correct operational
day.

Recording a milestone does not modify `UnitMealTime`, `OperationDefinition`, or any planned time.

### Idempotency and concurrency

Every command carries a `clientActionId`. Uniqueness is scoped by
`(eventId, milestone, clientActionId)`, and `eventId` already encodes Facility (through Unit), Unit,
operational date, and meal — so a replay returns the original effect and a reused identifier cannot
collide across contexts.

The interface derives the key deterministically from the unit, meal, milestone, and the value being
replaced. A double tap on the same rendered button therefore carries the same key and produces one
record. The key changes once a value exists, so a genuinely later press is a distinct command —
which is then refused as `ALREADY_RECORDED`, because changing a recorded time is a correction.

Concurrent identical commands race on the unique index; the loser re-reads and reports the
surviving record, so the pair produces one authoritative effect and no operator-visible failure.
The write runs in a transaction, so the projection and the entry cannot diverge.

This is the shape an offline queue needs: a command with a stable identifier, safe to replay.

### Corrections and audit

Corrections require `SUPERVISOR` or above, a reason of at least three characters, and an existing
value to correct. Correcting a milestone that was never recorded is refused rather than treated as
a late original — "Not Confirmed" is the absence of a record, not a recorded absence.

The Unit Workspace shows a correction disclosure to authorized roles, marks a corrected value
`(corrected)`, and shows the acceptance time separately when it differs from the occurrence time.

---

## 4. Verification

| Check | Result |
| --- | --- |
| `npm test` (clean environment) | 1265 tests, 1238 pass, 0 fail, 27 skipped |
| `npm test` (with disposable database) | 1265 tests, 1255 pass, 0 fail, 10 skipped |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 6 warnings (all pre-existing, unchanged from Phase 2) |
| `npm run build` | succeeds |
| `prisma validate` | valid |
| `prisma migrate deploy` on empty database | 62 migrations applied |
| `prisma migrate deploy` on database with legacy rows | backfill correct, originals unchanged |

New coverage: 26 pure tests across the fallback states and the full role/scope authority matrix,
plus 17 SQL-backed tests of the write path. The SQL-backed suite skips unless
`SERVERY_MILESTONE_TEST_DATABASE_URL` is set, keeping `npm test` hermetic on a fresh clone.

Runtime probes against a production build on a disposable database: 15/15 passed, covering the
servery with full configuration, the servery with no meal times (the 500 reproducer, now 200 with a
fallback panel), a kitchen unit, a retail unit, an unknown unit id (404), and the presence of the
idempotency key and correction disclosure in the rendered forms.

## 5. Known gaps

- The correction form interprets its `datetime-local` value in the browser's timezone. That is the
  facility's timezone for a tablet at the servery, but a supervisor correcting remotely from another
  timezone would submit an offset instant.
- The projection Unit Workspace (`PROJECTION_UNIT_WORKSPACE_ENABLED`) still renders no meal-service
  controls at all. It does not crash, but it offers no milestone workflow; the legacy loader remains
  the default and the pilot path.
- Corrections are visible in the Unit Workspace but the full entry history is not yet surfaced in
  the logs view.
