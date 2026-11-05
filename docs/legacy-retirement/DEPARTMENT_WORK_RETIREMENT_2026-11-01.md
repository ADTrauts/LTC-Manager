# Generic Department Work Retirement — November 1, 2026

**Status:** Accepted product-owner retirement decision  
**Applies before:** first real customer  
**Architecture source:** [16 — Department Builder Architecture](../product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md)

## Decision

Generic Department **Work** is not part of the forward Vssyl architecture.

The Department Builder Work section and its generic Work mechanisms are retired. There are no real customers whose compatibility requires preserving them.

Retirement scope includes, after dependency tracing:

- Department Builder Work navigation and routes
- `DepartmentWorkPlan` and Work Plan item configuration
- Expected Work resolvers/projections that exist only for generic Work
- `DepartmentWorkOccurrence` generic Work actuals
- Product Work presets / starter Work
- generic Work applicability, including function-key, Cycle, and Phase bindings used only by Work. Location Function is retired separately and is not a replacement target for Work.
- Dashboard / Job Flow / location composition readers that depend only on generic Work
- seeds, tests, docs, Marketplace language, and starter content that teach generic Work

## Not retired

This decision does not retire or merge:

- Records requirements or submitted Records
- Operational Cycles, Phases, or Key Points
- Shifts, daily Assignments, call-offs, or Coverage
- Facility Plant Operations Requests, Issues, Work Orders, or Preventive Maintenance
- Menus
- Assets
- Procedures / knowledge

## Ownership rule

Do not replace generic Work with another catch-all noun such as Task, Activity, Duty, Routine, Work Item, or Checklist.

When old Work behavior is traced, classify the real responsibility first:

| Old intent | Forward owner |
|---|---|
| Something must be documented | Records |
| A Department timing/window/event | Operating Rhythm |
| A person is scheduled / placed / needed | Shift / Assignment / Coverage |
| Equipment or built-environment work | Request / Issue / Work Order / Preventive Maintenance |
| Department-specific capability | That capability, if it passes the platform-gap test |
| Pure instruction / procedure | Knowledge / Procedure |

If no existing owner fits, stop for a new architecture decision. Do not preserve generic Work merely to avoid deciding ownership.

## Migration rule

1. Trace every reader and writer before schema removal.
2. Re-home only behavior that represents a valid forward concept.
3. Remove obsolete UI/routes/services/resolvers/tests/seeds.
4. Remove persistence only through new forward-only Prisma migrations.
5. Do not edit applied migrations and do not use `prisma migrate reset`.
6. Any destructive table/data drop still follows the repository's explicit drop-approval guardrail.

## Documentation rule

Older references to Work Plans, Expected Work, Work presets, or Work as a standard Department Builder section are superseded by this decision and [16 — Department Builder Architecture](../product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md). They must not be used to create new Work behavior while reconciliation is in progress.
