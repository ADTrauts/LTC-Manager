# Partner Assets — Phase 2D6A

Partner Asset authorization is the current row:

```text
Asset.unit.facilityId
AND
Asset.departmentId
AND
status != RETIRED
```

`departmentId` must equal the active partner Department. Null is invisible. It is not shared, Facility-wide, or all Departments.

## Location

The Unit and Room names on an authorized Asset are display context. Location responsibility does not authorize an Asset, and an authorized Asset does not add its Room to partner Locations.

## Current state

The registry follows the current `departmentId`. Reassignment and clearing the Department take effect on the next request. There is no Department ownership history.

## Asset detail

`/partner/assets/[assetId]` uses the same boundary as the list, including non-retired status. A miss is not found for the wrong Department, the wrong Facility, a null Department, a retired Asset, and an unknown id. The page may show manufacturer, model, serial number, and the Asset's own Unit and Room labels. It does not require that Room to appear in partner Locations.

Switching Department from a detail page returns to `/partner/assets`.

## Related domains

Work orders, issues, preventive maintenance, evidence, status history, attachments, and vendor contacts are not loaded with the partner list or detail. Asset visibility does not authorize them.

## Internal behavior

Internal Asset lists still include a null Department when a Department lens is selected. That helper is not used by the partner loader.
