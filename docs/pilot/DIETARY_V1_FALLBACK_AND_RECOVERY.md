# Dietary V1 — Fallback and Recovery

Honest recovery procedures for the controlled Dietary pilot.

## Wi-Fi outage

| | |
|--|--|
| Visible state | Offline / Unable to Sync on tablet |
| Preservation | Pending Milestone commands remain in IndexedDB |
| Recovery | Restore Wi-Fi; Retry synchronization |
| Owner | Frontline + Supervisor |
| Audit | Sync receipts on acceptance |

## Application outage

| | |
|--|--|
| Visible state | Login / pages unavailable |
| Preservation | Offline tablets retain queued commands if already prepared |
| Recovery | Wait for application restore; sync tablets; reconcile paper if used |
| Owner | Facility Administrator / IT + Supervisor |
| Manual | Paper continuity (below) |

## Tablet failure

| | |
|--|--|
| Visible | Device dead / unresponsive |
| Preservation | Commands only on that tablet’s storage — may be lost |
| Recovery | Bind a replacement tablet; Supervisor records missing Milestones online with attribution |
| Owner | Supervisor + FA |

## Pending command

Retry synchronization. Do not create duplicate intentional records without Supervisor guidance. Idempotent sync prevents double-apply of the same client command id.

## Reauthentication / session revocation

Sign in again. Pending offline commands are not silently accepted under revoked authority. Supervisor may need to record the Milestone online.

## Device replacement / Unit rebinding

Rebind device to Facility and Unit. Prior offline commands do not retarget to a new Unit. Prior Employee sessions must not expose Assignments after sign-out.

## Manual paper continuity

If tablets and application are unavailable:

1. Supervisor maintains a paper Assignment sheet (Unit, Employee, window).
2. Servery leads note Ready and Service Started times on paper.
3. When systems return, Supervisor enters confirmed Assignments and Milestones online with reasons where required.
4. Mark paper sheets with reconciliation time and actor.

## Escalation ownership

| Issue | Owner |
|-------|--------|
| Staffing / Assignments | Supervisor → Manager |
| Facility-wide timing | GM |
| Device / credentials | Facility Administrator |
| Application / database | Platform / IT |

## What this pilot does not claim

Unlimited uninterrupted operation during infrastructure outages is not guaranteed. Offline continuity covers prepared Unit Workspace Milestone flows only — not Assignment editing or cold-start authentication.
