# 05 — Action Model

## Decision

**Actions** are declared capabilities on an Experience (and optionally on tools). They are not ad-hoc button onClick handlers invented in pages. UI only renders actions that are declared, projected, and permitted.

---

## Action categories

| Category | Examples | Typical placement |
|----------|----------|-------------------|
| **Create** | Create work order, create assignment | Header / card primary |
| **Submit** | Submit log, submit form, submit inspection | Tool host / card |
| **Review** | Review submission, open finding | History / work queue |
| **Approve** | Approve corrective action | Card / modal |
| **Assign** | Assign task / coverage | Work queue |
| **Repair** | Open/create repair | Resources / escalate |
| **Inspect** | Start inspection | Header / tool |
| **Escalate** | Escalate issue, page supervisor | Status / alert card |
| **Resolve** | Resolve issue, complete task | Work queue |
| **Open Tool** | Open Logs / Knowledge / Forms | Section / toolbar |
| **View History** | Expand history | History card |
| **Download** | Export bounded report | Reports (entitled) |
| **AI Assist** | Generate/refresh allowed moment | AI section (home rules apply) |
| **Navigate Related** | Soft-link to related Experience | Overview / entity link |
| **Configure** | Open Settings | Settings (entitled) |

---

## Who owns actions?

| Aspect | Owner |
|--------|-------|
| Declaration (key, label, category, confirm?) | Experience Catalog / tool contract |
| Permission keys | Catalog + RBAC |
| Eligibility in context | Projection (narrow) ∩ overlay preconditions |
| Mutation execution | Server actions / domain engines |
| Placement in UI | Framework layout + card/header slots |
| Density filtering | Home adaptation (may hide secondary) |

---

## How actions are declared

```text
ActionDeclaration
  actionKey
  category
  label
  permissionKeys[]
  placement: HEADER | CARD | TOOLBAR | INLINE | MODAL_TRIGGER
  confirms?: boolean
  opens?: TOOL | DRAWER | MODAL | RELATED_EXPERIENCE | ROUTE
  preconditions?: overlay predicates (e.g. hasOverdueLog)
```

---

## Where actions render

1. **Experience header** — primary actions (≤2–3).  
2. **Card header / footer** — card-scoped actions.  
3. **Widget inline** — row-level actions (assign, resolve).  
4. **Tool host chrome** — submit/save inside tool.  
5. **Overlay surfaces** — modal/drawer triggered by action.  

Homes may demote header actions to overflow in compact density; they may not invent undeclared actions.

---

## Forbidden

- Client-only “actions” that mutate without server permission checks.  
- Actions that broaden scope beyond Projection.  
- AI Assist actions that create work or invent due times.  
- Duplicate competing CTAs that answer different product questions on the wrong home.
