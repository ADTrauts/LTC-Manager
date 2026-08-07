# Cross-Department Service Request Guide

**Phase:** 12A — Plant Operations Reference  
**Audience:** Dietary / EVS Staff and Leads reporting facility / equipment problems; Plant readers who need the requester contract  
**Companion:** [`PLANT_OPERATIONS_REFERENCE_PHASE_12A_2026-08-07.md`](./PLANT_OPERATIONS_REFERENCE_PHASE_12A_2026-08-07.md)

---

## Purpose

Explain how Dietary or EVS report a problem to Plant (or another configured responsible department) without confusing **requesting** vs **responsible**, and without exposing Plant-private triage details.

This uses shared **`OperationalRequest`** — not a Plant-only request table, and not an automatic Work Order.

---

## How Dietary / EVS report

1. Sign in to Unit Workspace for your Department (Dietary or EVS Job Flow enabled).  
2. Open **Report a Problem** (`ReportProblemForm`).  
3. Choose a **destination** from configured routes only (e.g. Plant).  
4. Optionally select an Asset; Asset is **not** required for non-equipment facility problems.  
5. Enter summary, description, observed time, priority, operational impact, workaround if any.  
6. Submit.

What happens:

- An `OperationalRequest` is created with your department as **requesting** and the chosen department as **responsible**.  
- Status starts at **Reported**.  
- **No Work Order is created** by reporting.

If no routes are configured, the form shows that no destinations are available (`report-problem-no-routes`). Plant is never assumed.

Asset Issue reporting (equipment condition with required Asset) remains a separate path and still does not auto-create a Plant WO.

---

## Requesting vs responsible

| Field | Meaning |
|-------|---------|
| Requesting department | Who reported (Dietary / EVS / …). Never rewritten on reroute. |
| Responsible department | Who owns triage / response (often Plant when routed). |
| Affected department | Optional; where impact is felt if different. |
| Location | Unit required; Space optional. |
| Asset | Optional on the Request. |

You remain the requesting department even when Plant creates and completes a Work Order.

---

## Limited requester status

After reporting, requester-visible status (`loadRequesterVisibleStatus` / `RequesterStatusPanel`) can show:

- Request code and summary  
- Public status label (Reported, Received, Under review, Work assigned, Work in progress, Waiting on vendor/parts, Monitoring, Resolved, Closed, …)  
- Workaround instruction  
- Location / Asset name when present  
- Requester-visible update text only  
- Linked Work Order **code** and **status** if Plant created one  

Use this to answer “did Plant get it?” and “is work underway?” — not to manage Plant’s queue.

---

## What is hidden from requesters

Requesters do **not** see:

- Internal triage notes (`triageNote`)  
- Private Request / Repair updates (`requesterVisible: false`)  
- Vendor selection, Vendor contact, or Vendor management fields  
- Plant Assignment coverage boards  
- Route configuration  
- Technician-only WO management controls  

Waiting-on-vendor may appear as a **status label** without Vendor internals.

---

## What Plant may do next (for context)

Plant Supervisor/Manager may acknowledge, triage, and **explicitly** create a Work Order. Completing that WO does not automatically close your Request or return equipment to service. Managers return Assets to service separately when appropriate.

You should not expect automatic repair tickets from every report.

---

## Authority reminder

- Dietary/EVS STAFF: report + view scoped requester status.  
- Quick PIN: eligible for frontline report/status only — not Plant Build or triage.  
- Cross-facility reporting fails closed.  
- Destination must be an active `DepartmentRequestRoute` for your requesting department.

---

## Limits

- This is not a Vendor portal or a full requester CMMS inbox.  
- Browser CI verifies the report form can appear for Dietary staff when routes exist; it does not automate every requester-status journey end-to-end.
