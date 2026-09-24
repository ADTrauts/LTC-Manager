# AI Experience Reference

**Status:** Product reference — AI as operational partner  
**Parent:** [00_PRODUCT_REFERENCE_INDEX.md](./00_PRODUCT_REFERENCE_INDEX.md)

AI is **not** a chat window. AI is **operational intelligence** delivered in **structured moments** aligned to the operation timeline.

---

## Design stance

| AI is | AI is not |
|-------|-----------|
| Briefing partner | Open-ended chatbot |
| Grounded in live state | Generic assistant |
| Optional expand | Blocking modal |
| Role-scoped | Same for everyone |
| Action-suggesting | Action-taking without authority |

Employees: minimal AI. Managers and supervisors: primary audience.

---

## AI surfaces (canonical)

### 1. Morning Brief

**When:** Manager opens Operations Center first time in operational day (or first open before active operation).

**Who:** Manager; optional supervisor variant on Today's Work.

**Content (max 5 bullets):**
- Active/next operation
- Site readiness one-liner
- Top 1–3 exceptions
- One "what changed since yesterday"
- Optional: walk order suggestion for supervisor

**Interaction:**
- Expanded by default first open only; collapses to one line after dismiss
- Tap expand for detail
- **No typing required**

**Not:** Essay, training content, weather.

---

### 2. Operational Summary

**When:** On demand — "How is breakfast going?" button on Center; voice future.

**Who:** Manager, supervisor.

**Content:**
- Phase and time
- Count ready / at risk / blocked
- Open recoveries
- Handoffs outstanding
- Plain language paragraph + bullet exceptions

**Interaction:**
- Request → summary card appears inline on Center
- Tap exception → drill to object
- Summary **expires** when state changes significantly — refresh offered

---

### 3. Recovery Assistant

**When:** Issue reported or blocked state; supervisor/manager opens issue or recovery panel.

**Who:** Supervisor, manager.

**Content:**
- What happened (restated)
- Similar past incidents at this location/asset
- Workarounds that worked before
- Suggested next steps (assign, substitute, escalate, defer)
- Policy link only if safety-related

**Interaction:**
- Panel section **"What worked before"** — not chat
- Tap workaround → pre-fill recovery note
- Manager confirms — AI does not auto-apply

---

### 4. Decision Support

**When:** Manager faces ambiguous at-risk (not blocked).

**Who:** Manager.

**Content:**
- Tradeoff framing: "Accept degraded 3B vs hold service"
- Impact: locations affected, time pressure
- Historical: how often this recurs

**Interaction:**
- Two or three clear choices with consequences stated
- Manager selects → records decision on operation
- **Not** single recommendation without alternatives

---

### 5. Shift Transition

**When:** Operation moves Closing → Complete or shift change.

**Who:** Manager + supervisor (shared card).

**Content:**
- What completed
- What carried forward (open issues, tickets)
- What next operation needs attention first
- Suggested handoff note text (editable)

**Interaction:**
- Confirm note → saved to shift log / knowledge
- Send to next shift supervisor notification

---

### 6. Prediction (maturity)

**When:** Center or walk list; subtle badge, not alarmist.

**Who:** Manager, supervisor.

**Content:**
- "3B warmer likely to fail before lunch" (pattern-based)
- "Tuesday handoff often late — check kitchen at 6:05"

**Interaction:**
- Tap why → shows pattern evidence
- Dismiss or snooze
- Never blocks workflow

---

### 7. Knowledge Retrieval

**When:** User taps **Help** on work item, location, or issue — or asks one-line question in AI field.

**Who:** All roles (employee: location tips only).

**Content:**
- Retrieved SOP fragment, equipment note, lesson
- Cited source: "From 3B location notes · updated Mar 12"

**Interaction:**
- Inline expand — no navigation away
- If no knowledge: "No tip recorded — ask supervisor"

**Not:** Search the whole library.

---

## AI placement in product

| Surface | AI placement |
|---------|--------------|
| Operations Center | Morning Brief, Operational Summary, Decision Support |
| Today's Work | Supervisor brief, walk order, shift transition |
| Unit Workspace | Knowledge retrieval only (Help) |
| Issue detail | Recovery Assistant |
| Review zone | Trend narration (analytics crossover) — not live AI |

**No floating chat bubble** globally.

---

## Input model

- **Curated prompts** as buttons: "How's breakfast?" "What changed?" "Where first?"
- **Single-line ask** optional on manager Center
- **No** multi-turn conversation required for value
- Multi-turn allowed but **rare** — decision support follow-up one level deep

---

## Output model

- Plain language
- Bullets over paragraphs
- Every claim tied to **visible state** user can verify
- Uncertainty stated: "I don't see coverage assigned yet"
- Never fabricate readiness

---

## Authority boundaries

| AI may | AI may not |
|--------|------------|
| Suggest walk order | Reassign staff |
| Suggest workaround | Mark issue closed |
| Draft handoff note | Approve safety exception |
| Summarize state | Change permissions |

---

## Failure modes (product)

- AI unavailable → Center works fully without brief
- Stale data → AI says "as of 6:12" timestamp
- Wrong suggestion → manager ignores; no penalty
- Employee never blocked by AI error

---

## Related documents

- [02_OPERATIONS_CENTER_REFERENCE.md](./02_OPERATIONS_CENTER_REFERENCE.md)
- [06_OPERATION_FLOW_REFERENCE.md](./06_OPERATION_FLOW_REFERENCE.md)
- [reference-ux/09_OPERATIONAL_AI.md](../reference-ux/09_OPERATIONAL_AI.md)
