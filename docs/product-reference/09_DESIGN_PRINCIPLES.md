# Design Principles

**Status:** Product reference — decision guide  
**Parent:** [00_PRODUCT_REFERENCE_INDEX.md](./00_PRODUCT_REFERENCE_INDEX.md)

Use these principles to resolve product debates. When two options are viable, choose the one that better satisfies the higher-numbered rule only when lower rules are equal — **rule order is priority**.

---

## 1. Operations before administration

Daily operational surfaces are default. Configuration is deliberate, entered, and exited.

**Test:** Would a manager on a busy morning hit this on accident? If yes, it belongs in Administration.

---

## 2. One screen, one decision

Each screen or panel answers **one primary question**.

| Screen | One decision |
|--------|--------------|
| Operations Center | Are we ready / what needs me? |
| Unit Workspace | What do I do next here? |
| Coverage panel | Who covers the gap? |
| Issue detail | What is the status and next step? |

**Test:** Can you name the decision in five words? If not, split the screen.

---

## 3. Everything answers "What do I do next?"

Every state — empty, loading, success, failure — offers a **next step**.

| State | Next step |
|-------|-----------|
| Queue empty | "You're done for this phase" or switch location |
| Blocked | Retry, escalate, or workaround |
| Submitted | Next work item promotes |
| Error | Retry or report |

**No dead ends.**

---

## 4. Reduce cognitive load

Show less; promote one thing. Hide site-wide noise from floor. Collapse context until needed.

**Test:** Would a floater on first day understand in 30 seconds?

---

## 5. Exceptions before completeness

Problems appear above green checks. 100% log completion does not headline if service is at risk.

---

## 6. Locations before modules

Organize by **where**, not by **logs vs repairs**. User thinks "4A problem," not "repairs module."

---

## 7. Operations before documentation

Capture during work. Forms are steps in the work queue, not a separate destination.

---

## 8. Context travels

Drill-down carries operation, location, reason. Back returns without amnesia.

---

## 9. Honest variance

Recovered, degraded, partial success are visible states. Never silent reset to green.

---

## 10. Role-appropriate product

Employee product ≠ shrunken manager product. Different homes, different density.

---

## 11. Time-bound awareness

Breakfast state does not imply lunch. Show phase and clock.

---

## 12. Recovery is normal

Reporting and recovering are as easy as completing checks. No blame UX.

---

## 13. Knowledge in context

Help on the work item, not search the wiki.

---

## 14. Intelligence ≠ analytics on open

Live awareness on Center; trends in Review.

---

## 15. Industry configures labels

Structure is universal; "servery" vs "nourishment room" is config.

---

## Decision checklist

Before adding a feature:

1. Which capability does it serve?
2. Which canonical screen?
3. Which single decision?
4. What is next after success?
5. Does it violate principles 1–5?

If 3 or 5 fail, redesign.

---

## Anti-patterns catalog

| Anti-pattern | Principle violated |
|--------------|-------------------|
| Module homepage | 6, 1 |
| Employee sees site dashboard | 10, 4 |
| Report opens new app area | 7, 3 |
| Green dashboard, failing floor | 5, 9 |
| Chat as primary AI | Intelligence ≠ chat |
| Admin link on Center header | 1 |
| Ticket number without context | 6, 4 |

---

## Relationship to other references

| Document | This principles doc |
|----------|---------------------|
| Product Constitution | Why |
| Reference UX | Feel |
| Reference Capabilities | Abilities |
| Product Reference | Movement and screens |
| This doc | Resolve tradeoffs |

---

## Related documents

- [10_PRODUCT_REFERENCE_CERTIFICATION.md](./10_PRODUCT_REFERENCE_CERTIFICATION.md)
- [PRODUCT_CONSTITUTION.md](../platform-vision/PRODUCT_CONSTITUTION.md)
