# 15 — Implementation Recommendations

## Status

Wave **15AA** = architecture only.  
Do not implement Experience Runtime shell or expand Projection until ordered below.

---

## Recommended sequence

**Superseded naming:** Wave **15AB** is now the **Experience Composition Framework** architecture (`docs/experience-framework/`). Implementation follows that package’s plan:

### 15AC — Experience Contract & Composition Expansion

- Extend Wave 14A registry with contracts (`04`) **and** composition declarations (sections/cards/widgets/layout densities).  
- Golden fixtures; no UI shell; no Projection.

### 15AD — Experience Shell Framework

- Generic shell + component registry stubs (see `docs/experience-framework/`).

### 15AE — Generic Tool Host

- LOGS / KNOWLEDGE / FORMS hosted in shell.

### 15AF — Projection Domain Model + Services

- As certified in `docs/operational-projection/15` (15B/15C).  
- Emit Experience contract + composition descriptors.

### Then

- 15AG Sidebar/Locations → 15AH Unit Workspace → 15AI Business Workspace → 15AJ OC/Today.  
- Retarget Logs/Knowledge; AI contract wiring; analytics keys as needed.

---

## Ordering rationale

Composition architecture (15AB) before contract code (15AC).  
Declarations before shell (15AD).  
Shell/tool host before production Projection cutover (15AF).  
Homes last. Admin/Facility Builder untouched.

---

## Explicit non-work now

- No Prisma Experience runtime tables (catalog stays code-owned).  
- No route redesign.  
- No Department Administration rewrite.  
- No production Projection.
