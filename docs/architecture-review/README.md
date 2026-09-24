# LTC Manager — Architecture Review

**Mode:** Discovery only (no code changes, no recommendations).  
**Date:** 2026-07-07  
**Scope:** Repository at `/Users/andrewtrautman/Desktop/LTC Manager`  
**Application root:** `ltc-manager/`

This folder documents the **current state** of the LTC Manager codebase as observed from source, schema, migrations, and existing project documentation (`ltc-manager/memory-bank/`).

## Documents

| # | Document | Contents |
|---|----------|----------|
| 1 | [01-technology-stack.md](./01-technology-stack.md) | Frameworks, runtime, database, auth, state, UI, build/deploy |
| 2 | [02-repository-structure.md](./02-repository-structure.md) | Folders, apps, API layout, shared libs, components |
| 3 | [03-database-assessment.md](./03-database-assessment.md) | All Prisma models, relationships, hierarchy, gaps |
| 4 | [04-existing-features.md](./04-existing-features.md) | Every implemented feature and maturity rating |
| 5 | [05-ui-assessment.md](./05-ui-assessment.md) | Pages, navigation, dashboards, layout, design |
| 6 | [06-domain-assessment.md](./06-domain-assessment.md) | Business concepts and how they are represented |
| 7 | [07-architecture-assessment.md](./07-architecture-assessment.md) | Strengths, weaknesses, debt, coupling, scalability |
| 8 | [08-product-assessment.md](./08-product-assessment.md) | What product the repository is building today |

## Executive summary

LTC Manager is a **Next.js 16 monolith** with **PostgreSQL + Prisma**, targeting **long-term care facility operations** with a **dining-first wedge**. The architecture is **facility-scoped**, **unit-driven** (sidebar and dashboards follow admin-created units), and supports **dual authentication** (email/password for leadership, 6-digit PIN for floor staff on facility-bound tablets).

Phases 0–6 and subsequent phases (A–E, plus EVS/plant ops, menus, self-serve onboarding, HR backlog) are **largely complete** per `memory-bank/progress-log.md`. The system is beyond scaffold: logs, staffing, employees/HR, assets/repairs, menus, EVS board, reports, admin permissions, and Stripe billing are implemented.

**Not present in code:** inventory, messaging, generic task management, clinical/EMR integration, multi-facility district analytics, SSO, automated manager email invitations.

## Methodology

- Read `package.json`, `prisma/schema.prisma`, all `src/app/**/page.tsx` routes, API routes, `src/lib/*`, `src/components/*`, `src/proxy.ts`, config files, and `memory-bank/*`.
- Maturity ratings are inferred from implementation depth (schema + UI + server actions + guards), not from product marketing.
- Ratings used: **Stub**, **Prototype**, **Partial**, **Production-ready**.
