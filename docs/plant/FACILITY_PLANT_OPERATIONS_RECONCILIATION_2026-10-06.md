# Facility Plant Operations — Current Reconciliation

**Date:** 2026-10-06  
**Mode:** Current-state architecture after Phase 5B and V1 release certification  
**Classification:** SUPPORTING  
**Canonical Product:** [14 — Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md)  
**Release gate:** [V1 release certification](./FACILITY_PLANT_OPERATIONS_V1_RELEASE_CERTIFICATION_2026-10-06.md)  
**Historical audit:** [2026-10-05 reconciliation](./FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-05.md) remains Phase 0/1 history. It is not current certification.

Facility Plant Operations remains **DEVELOPMENT**. This document describes the built Product, not a release decision.

---

## Product identity

| Use | Meaning |
|-----|---------|
| **Facility Plant Operations** | Official Department Product name |
| **Plant Operations** | Default local Department name |
| `PLANT` | Installation / registry key |
| **DEVELOPMENT** | Not Marketplace-visible; customer install blocked |

Runtime remains: installed Plant Product **or** internal `PLANT_OPERATIONS_ENABLED` DEVELOPMENT override. No new Harbor dependency.

---

## Request / Issue / Work Order

| Noun | Meaning | Persistence / route |
|------|---------|---------------------|
| **Request** | Intake. Someone is asking for maintenance attention. | `OperationalRequest` |
| **Issue** | Known undesirable condition. May exist without an Asset or a Work Order. | `AssetIssue` · `/asset-issues` |
| **Work Order** | Accepted maintenance work with a persistent lifecycle. | `Repair` · `/repairs` |

Location-only Issues and Requests are valid. Completing a Work Order does not auto-resolve the Issue or restore Asset condition. Closeout records work performed, labor, parts, vendor expense, required Records, and condition review.

---

## Recurring Work vs Preventive Maintenance

| Kind | Meaning |
|------|---------|
| **Recurring Work** | Shared Work Plans: rounds and walkthroughs. Configured in Plant Build → Work. |
| **Preventive Maintenance** | Scheduled service against a **real Asset**. Configured in Plant Build → Maintenance. Run surface: `/preventive-maintenance`. |

Not every recurring activity is PM. Starter Work presets never create PM Plans.

---

## Asset lifecycle vs condition

Asset lifecycle (operational / out of service / retired) is registry status. Asset condition is observed operating condition. They are not the same fact. Starter configuration never creates demo Assets.

---

## Starter configuration

Package name: **Plant Operations starter configuration**.

- Optional. Manager+ only. Select-before-install from Build Overview.
- Four recurring Work presets and five Record templates.
- Facility-owned drafts. No auto-publish.
- Idempotent: no duplicate, no overwrite.
- Presence derived from `presetKey` / `stableKey`. No `SETUP_COMPLETE` flag.
- PM cadence presets are UI-only: Monthly 1, Quarterly 3, Semiannual 6, Annual 12, lead days 7, Routine. Real Asset required.

---

## Current routes

| Label | Route | Class |
|-------|-------|-------|
| Assets | `/assets` | Run registry |
| Asset Builder | `/assets/builder` | Build identity |
| Work Orders | `/repairs` | Run queue |
| Issues | `/asset-issues` | Run queue |
| Preventive | `/preventive-maintenance` | Run PM |
| Plant Build | `/build/departments/:id` | Overview, Work, Records, Maintenance |
| Work Plans | `/staffing/work-plans` | Shared Work configuration |
| Record templates | `/staffing/templates` | Shared `OperationalTemplate` |

---

## V1 deferrals

Still deferred: inventory, purchasing, payroll, meter/usage PM, IoT, predictive, advanced analytics, contracts, warranties, Product `AVAILABLE`, billing SKU.

V1 release certification (2026-10-06) recommends `AVAILABLE` as a separate explicit action. Committed Product status remains **DEVELOPMENT**.
