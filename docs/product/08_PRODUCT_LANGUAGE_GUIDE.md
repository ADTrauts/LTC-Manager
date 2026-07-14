# 08 — Product Language Guide

**Status:** Canonical terminology for UI, docs, and AI prompts  
**Rule:** Prefer one term. Avoid synonym drift.

---

## Homes and zones

| Use this | Do not use as synonym |
|----------|----------------------|
| **Business Workspace** | Manager Dashboard, Home Console, Mission Control |
| **Operations Center** | Global Dashboard *(legacy path `/dashboard` ok)*, Command Center |
| **Today's Work** | Supervisor Board, Daily Tasks (as zone name) |
| **Unit Workspace** | Unit Dashboard, Location App |
| **Locations** (nav) | Units list *(schema may still say Unit)* |
| **Administration** | Settings (unless form-level), Backend |

---

## Domain words

| Use this | Meaning | Avoid |
|----------|---------|-------|
| **Facility** | Operational site | Site *(vision alias — migrate language to Facility)* |
| **Organization** | Parent of facilities | Company, Tenant *(unless billing copy)* |
| **Department** | Operational mode / ownership | Line of business |
| **Location / Unit** | Place of work — UI “Location”, model often `Unit` | Room *(unless truly a resident room entity)* |
| **Operation** | Time-bound service commitment | Shift *(shifts are coverage; operations are service windows)* |
| **Task** | Work Engine projection | Ticket *(unless issue context)* |
| **Issue** | Disruption requiring recovery | Ticket, Incident *(unless safety-legal context)* |
| **Repair** | Persistence/equipment work order record | Prefer Issue in product copy when showing the façade |
| **Finding** | Inspection item outcome needing follow-up | Defect *(unless manufacturing)* |
| **Inspection** | Verification workflow | Audit *(unless regulatory audit specifically)* |
| **Knowledge** | Operational SOP/reference | Wiki, CMS |
| **Asset** | Equipment / plant object | Device *(reserve for PIN tablets)* |
| **Employee** | Roster person | User *(User = app login identity)* |
| **Call-down** | Coverage change needing attention | Call-off *(synonym risk — pick Call-down in product)* |

---

## Readiness language

| Use this (UI) | Internal may remain |
|---------------|---------------------|
| **Ready** | `ready` |
| **In Progress** | `in_progress` |
| **Needs Attention** | `blocked` |

Never show **Blocked** to end users. Never say **Complete** for readiness green.

---

## Workspace language

| Use this | Avoid |
|----------|-------|
| **Manager Focus** | Top Priorities *(as section title — Priorities may exist as optional list)* |
| **Management Agenda** | Calendar, Schedule *(no RRULE)* |
| **Quick Actions** | Shortcuts Dock |
| **Current operations are on track.** | All clear / Green day / No problems |

---

## AI language

| Use this | Avoid |
|----------|-------|
| **Morning Brief** | AI Summary (unless origin is fallback Operational Summary) |
| **cached** | Live AI when showing Workspace peek |
| **Operational Summary** | Only for non-AI fallback origin |

---

## Consolidation recommendations (docs; code later)

1. Prefer **Issue** in all manager-facing copy; keep `/repairs` only until routes converge.  
2. Prefer **Facility** over Site in new docs.  
3. Prefer **Needs Attention** everywhere readiness is user-visible.  
4. Stop calling Workspace “Wave 12 Industry” — that overloaded the roadmap term.
