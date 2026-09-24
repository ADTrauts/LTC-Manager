# Operational AI

**Audience:** Managers, supervisors — AI as operational partner  
**Status:** Canonical AI experience (conceptual)  
**Parent:** [00_REFERENCE_UX_INDEX.md](./00_REFERENCE_UX_INDEX.md)

---

## Purpose

AI on this platform is **not a chatbot in the sidebar**.

AI is an **operational partner** that understands what is happening now — operations, readiness, staffing, issues, history, recovery, risk — and helps leaders **orient, prioritize, and decide** in language they already use.

The employee on the floor may never "talk to AI." The manager at 6:40 AM might **only** need a spoken summary while walking.

---

## What AI is not

| Not this | Because |
|----------|---------|
| Generic chatbot | Invites distraction; ignores operational context |
| Search replacement | Search is hunting; AI should orient |
| Documentation author | Operations before documentation |
| Autonomous decision-maker | Managers decide; AI informs |
| Feature demo | AI must earn trust on real mornings |

---

## What AI understands

AI grounds every response in **operational context**:

| Domain | AI awareness |
|--------|--------------|
| **Current operations** | What is active, what phase, what is next |
| **Readiness** | Which locations ready, blocked, recovering |
| **Staffing** | Coverage gaps, call-downs, floaters |
| **Issues** | Open equipment, supply, environment — severity and impact |
| **History** | Patterns — "4A late three Tuesdays," recurring warmer faults |
| **Recovery** | What is in progress; what worked last time |
| **Operational risk** | What will fail next if untouched |
| **Knowledge** | Location notes, equipment quirks, lessons — retrieved in context |

AI does not invent facts. When uncertain, it **says what it knows and what it does not**.

---

## User mindset

**Manager:** "Tell me what matters — I have two minutes."

**Supervisor:** "Which of my locations first?"

**Neither** wants to craft prompts or learn syntax.

They ask **human questions**. AI answers **like a seasoned chief of staff** who watched the board all morning.

---

## Example interactions (conceptual)

### Orientation

**"How is breakfast going?"**

AI responds with operational summary — not module stats:

- Phase: execution, 40 minutes remaining.
- Site: at risk — two locations need attention.
- 4A blocked: failed sanitizer check, server en route.
- 3B recovered: running simplified hot line until warmer repaired.
- Open call-down: 2 North dinner still uncovered for tonight.

---

### Prioritization

**"What should I worry about?"**

AI ranks by **service impact** and **time sensitivity**:

1. 4A blocked — breakfast service commitment at risk now.
2. Uncovered call-down for 2 North — not breakfast but will block dinner prep conversation.
3. Late chemical delivery — may affect lunch sanitation if not staged by 10:00.

---

### Change detection

**"What changed since yesterday?"**

AI contrasts operational picture:

- New isolation on 5 West — tray protocol active for lunch.
- Survey announced for 11:00 — EVS priority elevated.
- Warmer 3 repeat fault — third time this month; plant ticket open.

---

### Routing

**"Which units need me first?"**

AI produces **walk order** with reasons — supervisor-compatible:

1. 4A — blocked, breakfast.
2. Central kitchen — handoff to porters delayed 12 minutes.
3. Retail — at risk, staffing thin after call-off.

---

### Recovery support

**"What did we do last time the warmer failed on 3B?"**

AI retrieves **issue history and recovery**:

- Workaround: backup unit from 2B, simplified menu, resolved by 9:15.
- Plant replaced element; note says allow 30 min preheat.

---

### Risk forward

**"Will we make lunch?"**

AI projects from **current state + preparation timeline**:

- At risk if central kitchen handoff not cleared by 10:30.
- Coverage gap at west serveries unresolved.
- Not blocked yet — two decisions needed.

---

## AI behavior principles

1. **Operation-centric answers** — frame every response around service commitments.
2. **Exceptions first** — lead with what is wrong, not congratulations.
3. **Plain language** — location names, meal periods, roles humans use.
4. **Cite grounding** — "because sanitizer check failed" not mysterious confidence.
5. **Appropriate brevity** — default short; expand on request.
6. **Role-aware** — supervisor gets my locations; manager gets site.
7. **Time-aware** — knows phase; does not answer about breakfast at 2 PM unless asked.
8. **Recovery-positive** — describe variance and recovery without blame.
9. **No false green** — never summarize healthy if floor is blocked.
10. **Human decides** — suggest actions, do not auto-execute staffing or service stops without authority.

---

## Where AI appears (experiential)

| Surface | AI role |
|---------|---------|
| **Operations Center** | Morning brief; change summary; risk highlight |
| **Supervisor Workspace** | Walk order suggestion; "since you were at 3B…" |
| **Recovery moment** | Similar past incidents; workaround hints |
| **Transition** | Carry-forward summary for next shift |
| **Voice / mobile** | Hands-busy orientation — optional future |

AI does not dominate Unit Workspace for floor employees unless they **ask for help** — employees get clarity from design, not conversation.

---

## Trust and transparency

Managers will not trust AI that:

- Contradicts the floor.
- Hides uncertainty.
- Sounds like marketing.

Trust builds when AI:

- Matches what they see when they walk.
- Admits missing data.
- Improves prioritization over time from patterns **they recognize**.

---

## Relationship to reporting

Reports answer **what happened**. AI answers **what is happening and what matters next**.

AI may **point to** reports for depth — "last week's lunch staffing gaps" — but is not a report generator on open.

---

## Cross-industry applicability

Same questions, different operations:

| Industry | "How is it going?" means |
|----------|--------------------------|
| LTC | Meal service on floors |
| Hospital | Patient dining window |
| K-12 | Lunch period |
| University | Dinner rush |
| Corporate | Peak café service |
| EVS | Pre-round readiness |
| Plant | Kitchen-critical assets today |
| Laundry | Turn window |
| Hospitality | Event service |

---

## Anti-patterns

- Chat window as homepage.
- AI answers without operational grounding.
- Verbose essays when manager needed three lines.
- Suggesting actions outside user authority.
- Replacing supervisor judgment with black-box scores.
- AI that only knows documentation, not live state.

---

## Related documents

- [01_OPERATIONS_CENTER.md](./01_OPERATIONS_CENTER.md) — AI brief lands here
- [06_OPERATIONAL_AWARENESS.md](./06_OPERATIONAL_AWARENESS.md) — states AI summarizes
- [08_OPERATIONAL_KNOWLEDGE.md](./08_OPERATIONAL_KNOWLEDGE.md) — knowledge AI retrieves
- [07_OPERATIONAL_RECOVERY.md](./07_OPERATIONAL_RECOVERY.md) — recovery history AI uses
