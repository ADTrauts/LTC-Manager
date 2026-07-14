# Business Workspace — 30-Second Manager Acceptance Checklist

**Wave:** 12 (BW-019)  
**Route:** `/workspace`  
**Role:** Manager / GM / Facility Administrator (Supervisor: limited shell)  
**Commits:** shell → operational summary → manager workflow → daily-home polish

Answer each question from `/workspace` without opening a second dashboard mindset. Mark pass/fail.

---

## Pre-flight

- [ ] Sign in as Manager → land on Business Workspace (`/workspace`)
- [ ] Confirm page title **Business Workspace** with facility + department + current operation
- [ ] Confirm **Manager Focus** is the first operational section
- [ ] Confirm current agenda period is labeled **Now · current period**
- [ ] Confirm Quick Actions appear before optional metrics sections

---

## 30-second manager review

| # | Question | Where to look | Pass criteria |
|---|----------|---------------|---------------|
| 1 | Can I identify my top personal concern? | Manager Focus first card | Clear title + direct action button; no vague “check operations” |
| 2 | Can I see what is happening now? | Header operation + current agenda bucket | Meal/service + phase visible; current agenda emphasized |
| 3 | Can I identify the next period / operation? | Agenda upcoming buckets or Focus healthy secondary | Next bucket or next scheduled operation/link visible without calendars |
| 4 | Can I reach the source in one action? | Focus / agenda item buttons | Specific issue, unit, coverage, or inspection destination — not a dead end |
| 5 | Can I tell when operations are healthy? | Focus healthy state | Calm “Current operations are on track.” with useful next steps (not empty card) |
| 6 | Does facility switch fully change Workspace? | Switch facility → reload `/workspace` | Facility name, Focus, agenda, metrics, prefs match destination only |
| 7 | Are optional preferences respected? | Customize panel → hide/collapse/order/landing → reload | Choices persist per user + facility; required sections stay |
| 8 | Is no AI provider request made from Workspace? | Network / logs with brief enabled | Preview only when cached READY brief exists; no generate/refresh from Workspace |

---

## Focus healthy-state check

- [ ] With no urgent Focus cards, primary CTA is **Open Operations Center**
- [ ] At most two secondary links (Today’s Work, upcoming inspection, routine work, or next operation)
- [ ] No artificial urgency language

---

## Agenda check

- [ ] Morning / Midday / Afternoon / Evening resolve from **Facility.timezone**
- [ ] Past buckets look subdued; upcoming buckets do not overpower **Now**
- [ ] Due/overdue items appear before routine agenda items inside a bucket

---

## Brief preview check (only if `AI_BRIEF_ENABLED=true`)

- [ ] Cached READY same-facility brief shows headline + “cached” + OC link
- [ ] Expired / wrong facility / wrong department / disabled → preview hidden
- [ ] No refresh control on Workspace

---

## Out of scope (do not fail Wave 12 on these)

- Drag-and-drop section order
- Full Morning Brief card duplication
- Analytics, scheduling, communications, inventory
- Operations Center / Today’s Work / Unit Workspace redesigns

---

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Manager accept | | | Pass / Fail |
| Smoke (desktop + tablet) | | | Pass / Fail |
