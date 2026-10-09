# Partner Dashboard — Phase 2D7

`/partner` is the active Department's operational landing page. It composes certified reads. It does not own Review expectations, Log timing, or Asset ownership.

## Authorization

One `PartnerOperationalContext` scopes the request to `facilityId` and `activeDepartmentId`. There is no `dashboard.read` capability. A card is present only when the effective role has `review.read`, `logs.read`, or `assets.read`.

## Service date

The page resolves one Facility service date with `loadFacilityTimezone`, `getFacilityServiceDate`, and `toServiceDateKey`, then passes that instant to Review and Logs. There is no date picker.

## Review

The Review card shows canonical evidence summary lines only: missed, corrective action, and unavailable. Coverage, service timing, and Asset-issue impacts stay on `/partner/reports`. A day without those evidence lines says there are no evidence exceptions. It does not say the day is complete.

## Logs

Log counts come from canonical requirement `productState`. Not-applicable requirements are omitted. An empty requirement list is not "all complete."

## Assets

Asset counts use `partnerAssetWhere`: Facility through the Unit, exact `departmentId`, and non-retired status. The same helper scopes the Asset list and detail. `ACTIVE` and `OPERATIONAL` display as Operational. Null-Department and retired Assets are outside the count.

## Locations

Locations stay in navigation. The Dashboard does not count them.

## Excluded domains

Employees, staffing, Today's Work, work orders, preventive maintenance, Asset issues, and Organization portfolio comparisons are not loaded.

## Department change

The next request rebuilds every card for the current active Department. Partnership, assignment, and membership changes still fail through live Path B.
