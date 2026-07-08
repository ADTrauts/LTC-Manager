# Unit Workspace — PIN / Floor Tablet Regression Checklist

**Wave:** 3 (UNIT-009)  
**Route:** `/unit/[unitId]`  
**Role:** Staff / Lead (PIN) with unit access  
**Viewport:** Phone (~390px) and tablet (~768–1024px)  
**Environment:** Seeded facility (`npm run db:seed` in `ltc-manager/`) or bound kiosk device

Goal: Confirm log submit and servery ready/started remain reachable in **≤3 taps** from Unit Workspace without layout clutter.

Reference: [03_UNIT_WORKSPACE_REFERENCE.md](../../docs/product-reference/03_UNIT_WORKSPACE_REFERENCE.md), [02_UNIT_WORKSPACE.md](../../docs/reference-ux/02_UNIT_WORKSPACE.md)

---

## Automated preflight

```bash
cd ltc-manager
npm run typecheck
npx tsx --test src/lib/**/*.test.ts
```

Expected: all tests pass, including `unit-workspace-pin-flow.test.ts`.

---

## Tap budgets (pass criteria)

| Flow | Max taps from unit workspace overview | Pass if |
|------|----------------------------------------|---------|
| **Submit a due log** | **≤3** | Tap primary queue CTA → logs submit screen for assignment opens |
| **Servery meal ready** | **≤2** | Meal period selected (if needed) → tap **Meal service ready** |
| **Servery meal started** | **≤2** | Meal period selected (if needed) → tap **Meal service started** |

Open “About this location” sections **do not count** toward the primary tap budget when the queue already surfaces the action.

---

## PIN / kiosk landing

- [ ] PIN sign-in as **Staff** with an active unit → lands on `/unit/{id}` (or kiosk-locked unit)
- [ ] Orientation shows location name + active meal · phase
- [ ] **Next work** is above **About this location**
- [ ] Context accordion sections are collapsed by default (not a full dashboard)

---

## Log submit (≤3 taps)

- [ ] Seeded due / failed log appears as **Do this next** or in remaining queue
- [ ] Tap **Start now** / **Open** → `/logs?tab=submit&assignmentId=…` loads
- [ ] Can complete or cancel submit and return without losing unit context in history
- [ ] Context **Due logs / quick entry** still offers **Submit now** as fallback

---

## Servery controls (≤2 taps)

- [ ] On a **SERVERY** unit, meal ready/started controls visible in orientation without scrolling past Next work on tablet
- [ ] Meal period buttons are ≥ ~44px tall and usable with finger
- [ ] Tap **Meal service ready** → redirect back to unit workspace with success flash
- [ ] Tap **Meal service started** → same return behavior
- [ ] Queue demotes ready/started items after recording (optional visual check after refresh)

---

## Tablet density (UNIT-006)

- [ ] Workspace / Logs tabs are full-width on phone, large touch targets
- [ ] Header does not feel overcrowded: orientation + controls stack cleanly under `md`
- [ ] Primary CTA on queue items is large enough to tap (`Start now`)
- [ ] Expanding one context section does not hide queue permanently (scroll still shows Next work above)

---

## RBAC / regression

- [ ] Staff PIN can open own `/unit/{id}` and submit assigned logs
- [ ] Staff cannot open `/admin` or `/employees` (proxy redirect to entitled home)
- [ ] `/unit/{id}` route path unchanged

---

## Sign-off

| Field | Value |
|-------|-------|
| Tester | |
| Date | |
| Viewport(s) | |
| Build / commit | |
| Result | Pass / Fail |
| Notes | |
