# Controlled canonical Record pilot

This runbook starts canonical Records for one department. It does not turn them on for the whole facility, and it does not copy old Logs into the new Record book.

## Before the pilot

1. Confirm this deployment can run canonical Records (`CANONICAL_LOGS_ENABLED` is on). Leaving it off keeps every department on the previous Logs, even if a decision is already saved.
2. Sign in as a facility administrator.
3. Open the department, for example Dietary, and read Record engine on the overview.
4. Fix any blocker before choosing Canonical Records. Warnings, such as no Logs placed yet, do not stop the change.
5. Choose the next facility service date. Do not start in the middle of a day that already has work.
6. Confirm the sentence that new Logs use canonical Records from that date and that older history stays put. Save.
7. In Build → Logs, install and place the pilot Logs: cooler temperatures, an opening checklist, a sanitation audit, and the sanitizer reading log.
8. Confirm staff can reach Run → Logs on a tablet.

Plant maintenance and work orders stay on the previous Record templates. Do not switch that department as part of this pilot.

## Start of the pilot day

- Due Logs show the cooler, checklist, and audit for that service date.
- A normal cooler reading completes one requirement.
- An out-of-range reading asks for corrective action. A photo stays on that Record.
- A recheck is a follow-up. It does not complete the original time slot.
- The sanitizer log is online only. If the connection drops, the form says so and does not pretend the rows were saved.

## During the day

Watch submission failures, missed work, photos, and rechecks. A failure stays a failure. The product does not write the same action into the previous Logs.

## End of the service day

Open Review for that department and day. Export PDF, Excel, and CSV. The expected, completed, missed, and exception counts should match Review. Rechecks are follow-ups, not extra expected work.

## Roll back

On the department overview, choose Previous Logs and a future service date. Confirm and save.

- Records already submitted stay in the Log Book and in reports.
- Nothing is copied back into the previous Logs.
- The next service date uses the previous Logs again.
- A later canonical date can turn canonical Records back on without changing the earlier days.

## Outside this product

A facility may still keep its existing paper or clinical process during a trial. That is an operating policy. LTC Manager does not write both Record systems for the same action.
