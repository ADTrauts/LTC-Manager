# 06 — Tool Hosting Model

## Decision

Tools are **hosted** inside Experiences through a generic **Tool Host** card/section. Tools stay reusable platform instruments; Experiences request them via bindings; communication is message/slot-based — not tight page coupling.

---

## Tool kinds hosted

Logs · Forms · Knowledge · Checklists · Reports · Tasks · Automation · Documents  
(Aligned with Experience Runtime tools model; hosting is the framework concern.)

---

## How tools attach

```text
Experience.tools.bindings[]
  toolKind: LOGS
  bindingId
  templateIds[] / definitionIds[]
  sectionKey: LOGS
  cardKind: TOOL_HOST
```

Profile may select which templates are active. Projection emits bindings only when Experience + permissions allow.

---

## How Experiences request tools

Experiences **declare slots**, not import tool page components:

```text
toolHostRef: { toolKind, bindingId, mode: LIST | RUN | PREVIEW }
```

The Tool Host implementation resolves the binding and renders the tool UI inside the card.

---

## How tools communicate

| Channel | Direction | Purpose |
|---------|-----------|---------|
| **Overlay slots** | Engine → Tool | Due items, submissions, articles |
| **Action bus** | Tool → Experience shell | Request close, toast, navigate related |
| **Query scopes** | Projection → Tool | Mandatory fetch constraints |
| **Config** | Profile → Tool | Template/params |
| **Events** | Tool → Engines | Submit/save mutations |

Tools must not call home-specific APIs (`if businessWorkspace`). They speak only Tool Host + domain contracts.

---

## Reuse rules

1. One LOGS implementation serves all Experiences.  
2. Experience-specific behavior = templates + config + scopes — not forked log apps.  
3. Tool chrome respects Experience header context (breadcrumbs: Area → Experience → Tool).  
4. Opening a tool never drops Experience identity.

---

## Forbidden

- Standalone Logs/Knowledge modules as long-term IA.  
- Experience embedding another Experience’s tool host by copying code.  
- Tools that ignore Projection scopes.
