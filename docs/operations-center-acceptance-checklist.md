# Operations Center — 60-Second Manager Acceptance Checklist

**Wave:** 2 (OPS-011)  
**Route:** `/dashboard` (alias: `/operations`)  
**Role:** Manager or Supervisor with dietary operational access  
**Environment:** Seeded facility (`npm run db:seed` in `ltc-manager/`) or provisioned test site

Answer each question in **under 60 seconds total** without leaving LTC Manager. Mark pass/fail.

Reference: [FIRST_PRODUCT_SLICE.md](../../docs/platform-vision/FIRST_PRODUCT_SLICE.md), [02_OPERATIONS_CENTER_REFERENCE.md](../../docs/product-reference/02_OPERATIONS_CENTER_REFERENCE.md)

---

## Pre-flight (30 seconds)

- [ ] Sign in as **Manager** (email) → land on Operations Center (`/dashboard` or `/operations`)
- [ ] Confirm page title reads **Operations Center** (not Global Dashboard)
- [ ] Confirm **Active operation** banner shows current meal period and phase
- [ ] Confirm **Site pulse** appears directly under the banner

---

## Five questions (60-second test)

| # | Question | Where to look | Pass criteria |
|---|----------|---------------|---------------|
| 1 | Which serveries are **not ready** for the current meal? | Meal Boards card (below exceptions) | Can name at least one servery without Ready/Started, or confirm all show Ready/Started/Logged |
| 2 | Where am I **short staff**? | Staffing Gaps card (top section) | Can list locations with zero coverage, or confirm “all staffed” |
| 3 | What **logs failed** or are still due? | Unit Exceptions + compliance tiles | Failed/missed/pending counts visible; can open a unit drill-down |
| 4 | What **equipment or supply** problems are open? | Open Repairs card | Open and urgent counts visible; link to `/repairs` works |
| 5 | Is there an **uncovered call-down**? | *Wave 4 — not yet on dashboard* | Document “N/A until Today's Work”; verify staffing overrides on `/staffing` if needed |

---

## Exception-first layout (W2-01)

- [ ] **Unit Exceptions** appears before Meal Boards
- [ ] **Open Repairs** and **Staffing Gaps** appear before compliance summary tiles
- [ ] **Unit Log Board** appears after Meal Boards (secondary)
- [ ] **Birthdays** are not in the primary header tabs; access via “Team (secondary)” footer link or `/dashboard?tab=employees`

---

## Drill-down links (regression)

- [ ] Unit Exceptions → **Open unit** → `/unit/{id}` loads
- [ ] Unit Log Board unit name → `/unit/{id}` loads
- [ ] Open Repairs → **View repairs** → `/repairs` loads
- [ ] Staffing Gaps location → `/staffing?unitId=...` loads
- [ ] Secondary → **Employee roster** → `/employees` loads
- [ ] Secondary → **Birthdays this month** → `/dashboard?tab=employees` loads

---

## Alias and RBAC

- [ ] `/operations` redirects to `/dashboard` (same content)
- [ ] `/operations?onboarding=complete` preserves query on redirect
- [ ] Staff (PIN) cannot access `/employees` or `/admin` (proxy redirect to entitled home)

---

## Automated checks (before manual run)

```bash
cd ltc-manager
npm run typecheck
npx tsx --test src/lib/**/*.test.ts
```

---

## Sign-off

| Field | Value |
|-------|-------|
| Tester | |
| Date | |
| Build / commit | |
| Result | Pass / Fail |
| Notes | |
