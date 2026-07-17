# 14 — Migration Model

## Decision

Existing operational pages migrate into the Experience Framework by **retargeting meaning first**, then replacing layouts with shell composition — not by big-bang route deletion.

---

## Migration pattern

```text
Legacy page / module surface
  → Identify owning Experience(s)
  → Map UI blocks → Sections / Cards / Widgets / Tools
  → Declare composition on catalog
  → Mount via shell behind flag (implementation waves)
  → Retire bespoke layout
  → Keep routes as deep links into Experience+section when needed
```

---

## Surface mapping

| Legacy / current | Target Experience(s) | Framework mapping |
|------------------|----------------------|-------------------|
| Temperature logs UI | Temperature Monitoring | LOGS tool section + status cards |
| Meal Service / servery | Meal Service | Overview, status, operation overlay, related links |
| Cleaning lists/logs | Cleaning / Room Cleaning | Checklists/Logs tools |
| Assets registry pages | Assets / Equipment | Resources + records; Plant/Dietary variants |
| Repairs / Issues | Repairs / Work Orders | Work queue cards + repair actions |
| Inspections | Inspections / Audits | Forms/Records tools + history |
| Knowledge library (floor) | Tool inside Experiences | KNOWLEDGE host; Admin library stays admin |
| Forms standalone | FORMS tool bindings | Tool host |
| Work Orders board | Work Orders / Repairs | ACTION/STATUS densities on Today/OC |
| Unit Workspace mega-loader | Many Experiences | Per-Experience shells + scoped overlays |
| Business Workspace sections | Compact Experience cards | COMPACT density |
| OC exception rows | Status contributions | STATUS density aggregation |

---

## Compatibility

- Routes survive as entry/deep links.  
- Capability strings remain migration diagnostics only.  
- Dual-run: legacy view vs framework shell until parity.  
- No schema required for composition declarations (code catalog) in early waves.

---

## Definition of done per Experience

1. Composition declaration complete.  
2. Overlay slots wired.  
3. Actions permission-checked.  
4. Densities defined for Unit + at least one aggregate home.  
5. Legacy page either wrapper or removed.
