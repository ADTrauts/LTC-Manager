# Operational Assignment — Acceptance Checklist

## Schedule vs Assignment Visibility
- [ ] Manager can distinguish scheduled employees from operationally assigned employees on the Assignment Board.
- [ ] "Scheduled only" employees are informational, not warnings, when no template requires detailed placement.
- [ ] Coverage and reassignment assignments display their source distinctly.

## Required Position Fulfillment
- [ ] Supervisor can identify unfilled required positions when an active template exists.
- [ ] Fulfillment summary shows required, filled, unfilled, and conflict counts.
- [ ] Manual assignments fulfill matching template positions through role/unit matching.
- [ ] Completed/cancelled assignments do not count as filling current positions.
- [ ] No template = fulfillment metrics hidden (not zero-filled).

## Coverage and Conflict Distinction
- [ ] Intentional coverage assignments are distinguished from conflicts.
- [ ] Overlapping primary assignments produce a visible warning.
- [ ] Future operation gaps stay out of current-period warnings.

## Frontline Experience
- [ ] PIN employee sees only their own current and upcoming assignment.
- [ ] No audit history, fulfillment counts, or other employee data exposed to Staff/PIN.

## Assignment History and Audit
- [ ] Assignment history shows who changed what and when.
- [ ] Create, edit, lifecycle, reassignment, and coverage events are recorded.
- [ ] Template-created assignments record a CREATED event.
- [ ] Idempotent template reapply that creates nothing produces no event.
- [ ] History is visible to Supervisor+ on the Assignment Board.

## Today's Work / Coverage Integration
- [ ] Today's Work Coverage shows operational assignment summary when templates exist.
- [ ] Staffing gap and assignment gap remain distinct concepts.
- [ ] Assignment Board link available for Manager+.

## Business Workspace Integration
- [ ] Department Workspace shows "Positions filled" metric when active template exists.
- [ ] Manager Focus surfaces unfilled positions when they exist.
- [ ] No assignment metrics appear when feature flag is off or no template exists.
- [ ] Future gaps do not promote to current Manager Focus.

## Feature Flag
- [ ] Disabling OPERATIONAL_ASSIGNMENTS_ENABLED restores the old staffing experience.
- [ ] No assignment metrics, fulfillment summaries, or history UI appear when disabled.
- [ ] Server-side writes remain denied when disabled.
