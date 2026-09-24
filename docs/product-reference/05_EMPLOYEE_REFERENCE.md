# Employee Reference

**Status:** Product reference — floor employee experience  
**Parent:** [00_PRODUCT_REFERENCE_INDEX.md](./00_PRODUCT_REFERENCE_INDEX.md)

---

## User goals

- Start work **immediately** after sign-in.
- Always know **where** and **what's next**.
- Complete checks **fast** without hunting.
- **Report problems** safely.
- **Never feel overwhelmed** by the organization.

---

## Design stance

The employee product is **not** a simplified manager app. It is a **different product** with three zones only:

1. **Unit Workspace** (95% of time)
2. **Locations list** (if multi-location)
3. **Sign out / account** (minimal)

Everything else is **invisible**.

---

## Sign-in flow

| Step | Experience |
|------|------------|
| Approach kiosk / tablet | Login shows site name if device-bound |
| PIN entry | Large, calm, no keyboard unless email user |
| Success | **Direct to Unit Workspace** — no dashboard |
| Wrong location warning | Banner — continue allowed per policy |

**Time to first work item:** under 10 seconds after PIN.

---

## Simplicity rules

| Rule | Implementation (product) |
|------|------------------------|
| **One next thing** | Single promoted action |
| **No site statistics** | Employee never sees "14 of 16 ready" |
| **No other locations' problems** | Unless covering — then only donor + receiver |
| **No admin vocabulary** | "Check," "Mark ready," not "submission" |
| **No navigation depth** | Max 2 levels: list → workspace → focus check |
| **No dead ends** | After submit → next action or clear "done for now" |

---

## Confidence builders

- **Plain language** — "Breakfast service" not operation codes
- **Why this check** — one line on expand
- **Help at location** — tip from experienced staff note
- **Supervisor visible** — who to ask (name, not org chart)
- **Confirmation** — "Saved" / "Meal ready recorded" every action
- **Problem reported** — "Kitchen notified" not void

---

## No hunting

Employee never searches for:

- Which logs due — **queue shows them**
- Today's menu — **on workspace if relevant**
- Equipment status — **chips in context layer**
- Who is covering — **banner if float assignment**

Search is **absent** from employee nav. If it exists, capability failed.

---

## Multi-location employee

**Locations rail** — only allowed locations.

- Current location highlighted
- Switch location → full context swap
- Incomplete work warning if leaving mid-check

---

## Reporting a problem

**Always one tap from Unit Workspace.**

Flow:

1. What kind? Equipment · Supplies · Need help · Safety
2. Short description (optional voice-to-text future)
3. Severity implied by type or one tap
4. Submit → return to workspace with banner "Report sent"
5. Continue work if safe

No ticket numbers shown to employee unless asked.

---

## Interaction philosophy

- **Gloves-friendly** — few fields, large commit actions
- **Forgiving** — undo window on milestone mis-tap (short)
- **Offline-tolerant** (future) — queue saves locally, sync banner
- **No notifications spam** — only supervisor broadcast to this location

---

## What employee never sees

- Operations Center
- Today's Work / coverage grids
- Review / analytics
- Administration
- Other departments' modes
- Call-down lists (only "you're covering X" assignment)
- AI chat (optional help button → short answers only)

---

## Coverage assignment experience

When supervisor assigns float:

- Banner: **"You're covering 2 North for breakfast — server"**
- Workspace switches or offers switch
- Location knowledge tip promotes on open
- Original location work paused with note

---

## End of shift

- Close-out items in queue
- Sign out prominent
- Optional: "Shift complete at 4A" acknowledgment
- No HR paperwork on floor unless industry pack requires

---

## Related documents

- [03_UNIT_WORKSPACE_REFERENCE.md](./03_UNIT_WORKSPACE_REFERENCE.md)
- [07_OPERATIONAL_OBJECTS.md](./07_OPERATIONAL_OBJECTS.md)
- [reference-ux/04_EMPLOYEE_WORKSPACE.md](../reference-ux/04_EMPLOYEE_WORKSPACE.md)
