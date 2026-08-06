# Dietary Employee Job Flow — Guide

Phase 9B gives Dietary Employees a simple **Job Flow** on the Unit Workspace: where you are assigned, what phase of the day is active, what is expected now, and what comes next.

This is a **derived view**. Assignments, cycles, meal times, and Milestone confirmations remain the sources of truth.

## Before you start

1. Facility Administrators enable:
   - `DIETARY_OPERATIONAL_CYCLES_ENABLED=true`
   - `DIETARY_JOB_FLOW_ENABLED=true`
   - `OPERATIONAL_ASSIGNMENTS_ENABLED=true`
   - Keep `OPERATION_ENGINE_ENABLED` off.
2. Managers publish Operational Cycles for Dietary (see Operational Cycles manager guide).
3. Supervisors confirm today’s Assignment plan.
4. Units keep Breakfast / Lunch / Dinner times configured.

## How Employees use Job Flow

1. Sign in with **password** or **Quick PIN** on a bound tablet.
2. Open the **Unit Workspace** for your servery.
3. Read the **Job Flow** card:
   - **Unit** and **Duty** (from your confirmed Assignment)
   - **Cycle** (current phase of the Dietary day)
   - **Expectation** (what to do now — factual, not a checklist engine)
   - **Meal target** (from the Unit’s meal times when a meal is associated)
   - **Next** (upcoming cycle or Milestone expectation)
   - **Progress** (Upcoming / Current / Confirmed / Saved on this tablet / Not confirmed)

## Important language

- **Not confirmed** means no confirmation was recorded yet. It does **not** mean service failed or did not happen.
- If you have **no confirmed Assignment**, Job Flow says so neutrally — check with your Supervisor.
- If your Assignment **changes**, Job Flow shows the current Assignment. History is preserved; you are not rewriting the past.

## Offline

On enrolled tablets you can still record Servery Ready / Meal Service Started offline. Local evidence shows **Saved on this tablet** until synchronization completes. Job Flow may show last-synced context as read-only. You cannot edit Assignments offline.

## What Managers / Supervisors should tell staff

- Follow Job Flow for “now and next,” not as a scorecard.
- Confirm Ready and Started when those Milestones apply.
- Ask a Supervisor if Assignment or cycle guidance looks wrong — do not invent work from cycle labels.

## What Phase 9B does not do

- Automatic task generation or full checklists
- Unified Logs / Inspections builder
- Operations Engine
- Automatic scheduling
- Offline Assignment editing
