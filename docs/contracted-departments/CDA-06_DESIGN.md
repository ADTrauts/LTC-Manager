# CDA-06 design — operator-period data

Written October 22, 2026, when the product owner said to begin CDA-06. Approved by the product owner the same day, including no row deletion and no survey expiry. It follows [CDA-D10](./DECISIONS.md#cda-d10--data-belongs-to-the-operator-who-produced-it--accepted-user-october-20-2026), [CDA-D09](./DECISIONS.md#cda-d09--cross-department-work-stays-with-the-receiving-department--accepted-user-october-20-2026), [CDA-D18](./DECISIONS.md), [CDA-Q01](./DECISIONS.md#cda-q01--a-survey-during-a-vendor-contract--answered-user-october-20-2026), and [Architecture §8](./ARCHITECTURE.md#8-operator-period-data-cda-06).

## 1. What a period is

A period is one row of `DepartmentOperatorRelationship`: one Organization operating one Department from `effectiveFrom` through `effectiveTo`. An open end means the period is current.

A Department with no relationship row is the facility's own operation. Its rows carry a null period stamp. That null is the facility's period, not "unowned."

The stamp is `operatorPeriodId`, a nullable foreign key to `DepartmentOperatorRelationship`, `ON DELETE RESTRICT`. Rows stay in their tables. There is no second Records store and no copy-on-archive.

The same flag as the rest of the program applies: `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED`, default off. With the flag off, nothing is filtered and new rows may still store a null stamp. With the flag on, creates stamp the period in force and reads use the helper below. A second archive flag would let enforcement be on while one operator still reads another's rows, so this phase does not add one.

## 2. Who can see a period

One helper, `operatorPeriodsVisibleTo`, answers the period ids a person may read for one Department. It is called from Department queries. It does not replace Manage, View, Summary, or None.

| Viewer | Periods they may read |
|---|---|
| Flag off | No period filter |
| Current facility operator (the Department is self-operated, and the person may open it) | Null stamps, plus any period whose Organization is the facility's parent Organization |
| Current vendor team (Manage on a vendor-run Department) | The current period only |
| Vendor company admin, archive | Ended periods whose Organization is theirs. Current-period work stays on the operating pages |
| Facility Administrator, compliance Records only | Every period of that Department, current and ended, read-only |
| Anyone else | No vendor period. Summary and View do not open setup or people |

An incoming operator never receives the previous operator's period ids. That is true when the previous operator was the facility and when it was another vendor.

## 3. What gets a stamp

The first forward-only migration is `cda06_operator_period_stamp`. It adds `operatorPeriodId` and an index on `(departmentId, operatorPeriodId)` where the table has `departmentId`.

| Table | Why |
|---|---|
| `OperationalEvidenceRecord` | Compliance Records. The facility can read every period. The next operator cannot. |
| `Menu` | Setup. Retired and hidden at contract end. |
| `DepartmentWorkPlan` | Setup. |
| `DepartmentOperationalCycle` | Setup. Operating Rhythm. |
| `Employee` | Vendor workforce. Goes with the vendor. The facility keeps none of that period. |
| `ScheduleEntry` | Schedule rows for that workforce. |
| `CatalogLogDefinition` | A vendor-owned form belongs to the period that created it, as well as to its Organization. Vssyl-owned forms stay null. |

These do not get a stamp:

| Table | Why |
|---|---|
| `Asset` | Facility property. It stays. |
| `Repair` and operational requests | Cross-Department work stays with the receiving Department (CDA-D09). A vendor-paid cost and the vendor's repair company stay hidden by the CDA-05 payer rule. The work order itself stays visible to the facility. |
| Legacy `/logs` templates | No new reader or writer. Legacy retirement owns them. |

Child rows (menu items, work-plan items, cycle phases) stay with their parent. They are not stamped separately.

## 4. Backfill

Every account today is a test account (CDA-D17). The migration backfills in SQL. No customer migration.

For each stamped row, take its `createdAt` as a facility-local date and set `operatorPeriodId` to the relationship whose range contains that date for the row's Department. If none contains it, leave null. Null means the facility's own period.

The backfill does not rewrite history by hand and does not assign a current vendor period to rows created before that period.

## 5. Writes

While the flag is on, a create sets `operatorPeriodId` to the current relationship when the Department is vendor-run, and leaves it null when the Department is self-operated. The lookup is once per request, then reused.

Updates do not move a row to a new period. Ending a contract does not rewrite old stamps.

## 6. Contract end

Ending a period sets `effectiveTo` on `DepartmentOperatorRelationship`. That is the existing close. This phase adds what happens to the stamped rows:

- Menus, Work Plans, and Operating Rhythm rows for that period are retired when the model has a retired status, and hidden from the next operator's lists.
- Vendor forms for that period disappear from the facility catalog. Filled Records keep their snapshots and their stamp.
- Employees and schedule rows for that period disappear from the facility's People and Schedule. The vendor company admin can still open them in the archive.
- The next operator's new rows get the new period id, or null if the facility takes the Department back.
- Nothing is copied forward. The next operator starts from the product's starters, using the install path that already exists. This phase does not add a second copier.

Assets and work-order history stay on the facility pages. Vendor-paid costs and the vendor's repair companies stay hidden from the facility.

## 7. Archive

The archive is a read of the same tables, filtered to ended periods of the admin's Organization. It is not a new database.

Only an organization administrator can open it, from the organization workspace. The Facility Administrator cannot. The vendor head can see the current period on the operating pages. Ended periods are the company admin's.

## 8. Facility compliance Records

The Facility Administrator opens Records for a vendor-run Department from the Records path already used for Summary (`/staffing/log-book?department=`), including ended periods. The page stays read-only. It shows Records only: not menus, not people, not Work Plans.

The Dashboard does not link into those Records. Summary cards stay counts and status.

## 9. Retention

CDA-06 does not delete rows and does not set an expiry. Ended periods stay readable for a survey for as long as the rows exist. A later decision can add a retention job once a look-back length is chosen. This phase does not guess that length.

**Confirm this with the design.** If survey practice needs a fixed look-back in this phase, name it before implementation.

## 10. Performance

The period in force is loaded once per request, not once per row. List queries add the period filter to the existing Department filter. The new index is `(departmentId, operatorPeriodId)`. Backfill runs inside the migration, not on page load.

## 11. Build order after approval

1. The migration and the create-time stamp.
2. The read helper on People, Schedule, Menus, Work Plans, Operating Rhythm, the catalog, and Records.
3. Contract-end retire and hide.
4. The company-admin archive.
5. Facility Administrator Records across ended periods.
6. Fixture: a vendor-to-vendor handover and a vendor-to-facility handover. The facility still opens compliance Records. The next operator does not see the previous period.

Flag off stays the current behavior. No release, billing, or Plant feature change. No `prisma migrate reset`.

## 12. Out of scope

- Facility-made form authoring (LEG-02).
- The Dashboard flag and DSH-03.
- Production enablement (CDA-07).
- Deleting or exporting a period.
- Stamping assets, repairs, or Plant requests.
