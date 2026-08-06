# Dietary Operational Cycles — Manager Guide

Phase 9A lets Dietary Managers define the **named phases of the operating day** (Operational Cycles) and publish them so Employees and Supervisors see what part of the day is active.

This phase does **not** implement full Job Flow, minute-by-minute task lists, or automatic task generation.

## Before you start

1. Ask your Facility Administrator to set `DIETARY_OPERATIONAL_CYCLES_ENABLED=true` in the environment.
2. Keep meal serving times configured on **Units** (Breakfast / Lunch / Dinner). Those times remain the authority for when service is targeted.
3. Sign in with a **Manager or GM** password session (Quick PIN cannot edit Build configuration).

## Open Operational Cycles

1. Go to **Departments** (Administration → Departments, or the Department Builder link from Staffing → Cycle overview).
2. Open the Dietary department.
3. Select the **Operational Cycles** tab.

## Creating cycles

1. Use **Create draft** (or **Generate Dietary defaults** to create a reviewable starter set).
2. Set a **label** your team recognizes (for example “Morning Preparation” or “Breakfast”). Labels are yours — they are not global product language.
3. Choose a **type**: Preparation, Service, Transition, Closeout, or Custom.
4. Set **start** and **end** in facility local time.
5. Select **applicable days**.
6. For Service cycles, associate the matching **meal period** (Breakfast / Lunch / Dinner). The Unit meal times still supply the service target clock.
7. Choose which **locations** the cycle applies to (all Dietary units, unit types, or specific units).
8. For Service cycles, select expected **Milestones** (Servery Ready and/or Meal Service Started) when those confirmations apply.
9. Save as **Draft**.

Drafts are never shown to frontline Employees.

## Previewing the day

Use **Day preview** on the Cycles tab to see the sequence as a simple timeline (for example `5:30–7:30 Morning Preparation`). This is for understanding order — not a staffing schedule chart.

## Publishing

1. Fix any validation errors shown on the Draft.
2. **Publish** when the cycle should become active on its effective date.
3. Published cycles appear in Runtime for the applicable operational date.
4. Phase 9A does not allow overlapping published cycles that cover the same day and locations. Adjust windows before publishing.

## Retiring

**Retire** a published cycle when it should stop applying going forward. Historical operational dates keep the prior context. Do not delete published history.

## Understanding Runtime

- **Employees / Unit Workspace** see the current (or next) cycle, separately from their Assignment.
- **Supervisors** use **Staffing → Cycle overview** to scan applicable serverys for Ready / Started / Not Confirmed / late / missing configuration.
- **Not Confirmed** means no confirmation was recorded — it does **not** mean “service did not happen.”
- If cycles are missing, Runtime shows **Operational cycles not configured**. Managers can return to Department Builder to publish.

## Correcting missing configuration

1. Open Operational Cycles for Dietary.
2. Create or generate Drafts, review the day preview, publish.
3. Confirm Units still have meal times for the meals you associated.
4. Confirm Assignments separately on the Assignment Board if staffing coverage is wrong — cycles do not create Assignments.

## What Phase 9A does not do

- Full Employee Job Flow / step-by-step odometer
- Automatic task generation or automatic scheduling
- Automatic Assignment generation
- Offline editing of cycles
- Replacing meal times or Milestone history
