# EVS Manager Setup Guide

**Phase:** 11B — EVS Reference Implementation  
**Audience:** EVS Manager / GM-equivalent with EVS operational authority

---

## Before you begin

1. Confirm Facility Builder has Floors, Units/Neighborhoods, and Rooms/Spaces.  
2. Confirm EVS Department exists and shows in the Employee app.  
3. Confirm EVS location responsibilities cover the Units/Spaces EVS operates.  
4. Local activation requires `EVS_OPERATIONS_ENABLED=true` (does **not** turn on Operations Engine or Task sync).  
5. Select **EVS** as the active Department in the app shell.

---

## 1. Operational Cycles

Open **Staffing → Cycles** (or Department Admin Cycles).

- Generate **EVS defaults** (Morning Routine, Day Cleaning, Afternoon Round, Evening Cleaning, Shift Closeout) — Draft only.  
- Edit labels and windows for your facility.  
- EVS cycles do **not** require MealType.  
- Publish when ready. Facility-local time is authoritative.

---

## 2. Procedures

Open **Administration → Knowledge / Procedures**.

- Create or publish EVS Procedures (routine room clean, restroom, spill, equipment cleaning).  
- Synthetic guidance only — not clinical infection-control policy.  
- Link Procedures to Work Items later. Viewing a Procedure never completes Work.

---

## 3. Inspection Templates

Open **Staffing → Templates**.

- Create a Draft EVS **INSPECTION** Template.  
- Apply to Room / Space / Space type as supported.  
- Publish after review. Results do not certify a room as clinically safe.

---

## 4. Work Plans

Open **Staffing → Work Plans**.

Suggested Draft presets:

| Preset | Intent |
|--------|--------|
| Routine Room Clean | Resident rooms (`PATIENT_ROOM`) |
| Common Area Round | Lounges, corridors, public restrooms |
| Shift Closeout | End-of-shift Unit work |
| Room Turn / Special Clean | Manual special clean — no ADT trigger |

For each plan:

1. Create blank or from preset (always Draft).  
2. Set applicability (Unit and/or Space type / Specific Space).  
3. Add Work Items; link Procedure and optional Inspection.  
4. Preview the operational day.  
5. Publish only after Manager review.

Draft Work never appears to Employees.

---

## 5. Assignments

Open **Staffing → Assignments**.

- Confirm EVS Employees to Units for the operational date.  
- Room-level Work appears from Work Plan space applicability under that Unit.  
- Do not rely on automatic Assignment generation (out of scope).

---

## 6. Assets

EVS may use shared Assets for equipment (vacuums, floor machines, carts, dispensers).

- Register Facility-defined equipment as needed.  
- Employees can report Issues; EVS is not Plant Operations.

---

## 7. Verify Runtime

With a published plan, confirmed Assignment, and active cycle:

- Quick PIN as EVS Staff → Unit Job Flow shows rooms/work.  
- Supervisor → Operations Board shows coverage and exceptions.  
- Log Book filters to Department = EVS.

---

## Important limits

- Work Complete ≠ medically ready / sterile / infection-control certified.  
- Missing confirmation stays **Past Due / Not Confirmed** — not “Failed”.  
- No automatic discharge room turns.  
- No Plant Operations product in this phase.
