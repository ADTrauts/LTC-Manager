# 04 — Widget Model

## Decision

**Widgets** are the atomic UI/data units inside Cards. Hierarchy is strict:

```text
Experience → Section → Card → Widget
```

Widgets never mount outside a Card (except transient toasts/system chrome owned by the shell, not the Experience).

---

## Example — Temperature Monitoring

```text
Temperature Monitoring
  └── Section: CURRENT_STATUS
        └── Card: Compliance
              ├── Widget: ComplianceScore
              ├── Widget: CurrentTemperature (per equipment)
              └── Widget: AlertBanner
  └── Section: LOGS
        └── Card: ToolHost(LOGS)
              └── Widget: LogTemplateList / LogDueRow
```

---

## Widget kinds (illustrative registry)

| Kind | Role |
|------|------|
| `TEXT` / `RICH_TEXT` | Static or lightly templated copy |
| `STATUS_CHIP` | Shared status language |
| `METRIC_VALUE` | Single KPI |
| `LIST` / `TABLE_ROWS` | Bounded lists (scoped) |
| `PROGRESS` | Completion bars |
| `ALERT` | Warning/error callout |
| `ACTION_BUTTON` | Bound to Action declaration |
| `FORM_FIELD_GROUP` | Input cluster (forms/tools) |
| `CHART_SPARK` | Optional micro-viz (Experience metrics only) |
| `ENTITY_LINK` | Deep link to related Experience/record |
| `AI_SUMMARY` | Grounded text block |
| `EMPTY_HINT` | Empty-state messaging |

---

## Widget contracts

```text
WidgetDeclaration
  widgetKey
  kind
  propsSchema          # static props from Experience declaration
  overlaySlot?         # runtime data binding
  actionKeys[]?        # which actions may appear
  permissionKeys[]?    # additional gate
```

Widgets **must not**:

- decide Experience eligibility;  
- query without Projection scopes;  
- embed another Experience’s full shell;  
- invent due times.

---

## Live updates

Widgets subscribe to overlay slots. When overlay refreshes, widget re-renders; Projection snapshot identity remains unchanged.
