# 15 — Implementation Recommendations

## Status

Wave **15AA** = architecture only.  
Do not implement Experience Runtime shell or expand Projection until ordered below.

---

## Recommended sequence

### Wave 15AB — Experience Contract Expansion (catalog)

- Extend Wave 14A registry types with canonical contracts (`04`).  
- Declare anatomy sections + mount handles for existing catalog Experiences.  
- No UI consumers required beyond tests.  
- Still no Projection implementation.

### Wave 15B — Projection Domain Model

- As certified in `docs/operational-projection/15`.  
- Snapshot includes Experience contract descriptors.

### Wave 15C — Projection Services

- Emit Areas → Experiences → contracts.

### Wave 15AC — Experience Shell (framework)

- Generic shell renderer driven by projected workspace contracts.  
- Tool host for LOGS/KNOWLEDGE/FORMS.  
- Feature-flagged; attach first to Unit Workspace behind flag.

### Then

- 15E Sidebar/Locations (Area→Experience discoverability).  
- Retarget Logs/Knowledge entry points.  
- AI contract wiring (15K).  
- Analytics metric keys as needed.

---

## Ordering rationale

Contracts before Projection implementation prevents Projection from inventing UI.  
Shell after Projection domain model prevents shell from inventing eligibility.  
Admin/Facility Builder remain untouched.

---

## Explicit non-work now

- No Prisma Experience runtime tables (catalog stays code-owned).  
- No route redesign.  
- No Department Administration rewrite.  
- No production Projection.
