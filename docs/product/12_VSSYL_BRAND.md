# 12 — Vssyl Brand Specification

**Status:** Canonical current product identity  
**Scope:** Brand, naming, and visual identity — not architecture  
**Does not:** Redefine departments, generalize the domain model, or replace the operational UI

---

## Product

**Name:** Vssyl

**Descriptor:** Business Operations Platform

**Primary positioning line:** Your operations. All together.

---

## Brand model

Vssyl is the platform.

Departments operate within Vssyl.

Vssyl must not be described as synonymous with Dietary, EVS, Plant Operations, Long Term Care, or any other individual department or industry.

Department and industry language may appear inside a department’s own workflows. That does not make those terms the product identity.

Architecture and platform-language audits are separate work. This document only records the identity the product should present now.

---

## Logo concept

The Vssyl mark is a **V**:

- The left stroke is built from a small set of subtly differentiated blocks.
- Those blocks represent individual departments / operational functions.
- The right stroke is a unified solid form.
- Conceptually: distinct operational functions coming together through Vssyl.

The production SVG in this repository is a restrained application approximation. Geometry may be refined later by a designer. Do not invent an elaborate logo system around it.

The mark must stay recognizable at header, favicon, PWA, login, and home-screen sizes.

---

## Typography

**Geist** remains the product typeface. Do not introduce another font.

Preserve the existing type scale in `src/lib/design-system/design-tokens.ts`.

---

## Core palette

Preserve the existing visual foundation.

| Role | Value |
|------|--------|
| Brand / hero | `#0B3D3A` |
| Primary accent | `#0F766E` |
| Application canvas | `#E8EEF3` |
| Surface | `#FFFFFF` |
| Primary operational text / action | zinc-900 / `#18181B` |

Preserve existing semantic status colors (`status-styles.ts`): ready/success quiet emerald, in-progress/warning amber, blocked/needs-attention red, neutral zinc.

---

## Product modes

These colors communicate operating modes. They are not decorative themes.

| Mode | Language |
|------|----------|
| **RUN** | Existing teal wash and teal mode chips |
| **BUILD** | Existing orange wash, orange banner, orange mode chips |
| **ADMIN** | Neutral zinc |

---

## Design character

Vssyl should remain:

- calm
- operational
- clear
- restrained
- physical-world oriented
- exception-first

Healthy operations stay visually quiet. Exceptions receive visual prominence.

Preserve:

- bordered operational cards
- restrained shadows
- zinc operational surfaces
- compact information density
- tablet-friendly controls
- square SubNav language
- current status semantics

Do not convert the application into a generic SaaS dashboard aesthetic.

---

## Application of the name

Use **Vssyl** as the user-facing product name.

The platform staff desk is **Vssyl Console** (`/console`). Never call it Harbor Console in UI copy.

Where a descriptor is needed (metadata, billing, marketing footer):

**Vssyl — Business Operations Platform**

Do not use “LTC Manager” or “Harbor” as the product name on user-facing surfaces.

Internal implementation names, package names, cookies, Stripe lookup keys, and historical documents may still contain `ltc` or `Harbor`. Those are retained technical or historical identifiers unless a specific user-facing requirement requires a change.
