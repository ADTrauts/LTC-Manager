# 02 — Experience Definition

## Formal definition

```text
Experience =
  stable catalog identity
  + product meaning (name, purpose, eligible departments)
  + declared anatomy (sections)
  + declared contracts (contributions)
  + declared tools
  + configuration schema
  + engine dependencies
  + permission/action requirements
```

Runtime instance (after Projection):

```text
ProjectedExperience =
  Experience definition
  + facility profile configuration
  + archetype / exception tuning
  + location bindings
  + principal-narrowed actions
  + query scope handles
```

---

## Distinctions (expanded)

### vs Module

A module is a historic software bucket (route folder, nav item). Experiences replace modules as the *product* organization. Implementation folders may remain; users must not think in modules.

### vs Feature

A feature flag may gate an Experience’s availability. “Ship Temperature Monitoring v2” is a feature. Temperature Monitoring remains the Experience.

### vs Tool

Tools are reusable instruments. The same LOGS tool appears under Temperature Monitoring and Cleaning with different templates/bindings.

### vs Workspace / Dashboard / Page

Homes and pages are *where* Experiences are shown for a persona question. The Experience is *what* work is shown.

### vs Engine

The Experience is the product face. The engine is the durable/live mechanism (e.g., log submission lifecycle).

### vs Operational Area

Area = “Food Safety.” Experience = “Temperature Monitoring.” Areas without Experiences do not appear.

---

## What an Experience owns (concern map)

| Concern | Required | Optional | Never allowed |
|---------|----------|----------|---------------|
| **Overview** | Required (at least a purpose summary contract) | Rich overview cards | Becoming a second OC |
| **Current Status** | Required if Experience contributes readiness; else optional | Live status strip | Owning readiness *rules* (engine owns evaluation) |
| **Tasks / Outstanding work** | Optional | Work Engine dual-write views | Inventing a parallel global inbox |
| **Logs** | Optional (via LOGS tool) | Multiple log templates | Top-level Logs Experience as sole home |
| **Knowledge** | Optional (via KNOWLEDGE tool) | Context packs | Detached wiki product inside Experience |
| **Forms** | Optional | Structured capture | Arbitrary schema without config contract |
| **Assets / Equipment** | Optional | Lists scoped to Experience | Facility-wide asset admin (that’s Resources/Admin adjacency) |
| **Repairs / Work Orders** | Optional | Create/view in context | Owning Issue lifecycle (engine/domain owns it) |
| **Reports** | Optional | Experience-scoped reports | Facility analytics warehouse |
| **Metrics** | Optional | Declared metric keys | Conflicting definitions vs catalog analytics contract |
| **History** | Optional | Time-bounded history | Unlimited export warehouse |
| **Automation** | Optional | Declared hooks | Hidden automation without contract |
| **AI** | Optional | Moment hooks / summaries | Becoming chatbot home; inventing work |
| **Settings** | Optional | Experience config UI under Admin/Profile | Editing Facility Builder structure |
| **Notifications** | Optional | Declared notification kinds | Spam without preference/RBAC |
| **Documents** | Optional (often via Knowledge/Records) | Attachments | Unscoped document dump |
| **Training** | Optional | Competency links | HRIS/LMS ownership |

### Rules of thumb

- **Required:** identity, purpose, at least one contribution contract (usually workspace + query scope), permission keys for any mutating actions.
- **Optional:** most tools and chrome sections — declared in catalog, activated by profile.
- **Never:** owning physical structure; owning another Experience’s truth; replacing engines; exposing as a module peer named after a tool.

---

## Ownership of Experience attributes

| Attribute | Owner |
|-----------|--------|
| Name, description, icon, category, version | **Experience Catalog** (platform) |
| Eligible departments | **Catalog** |
| Default tools list | **Catalog** |
| Operational Area placement | **Department Profile** (facility) |
| Archetype enablement / config | **Department Profile** |
| Sparse room exceptions | **Department Profile** |
| Which rooms see it | **Projection** (from assignment + profile + policy + principal) |
| Visibility to a user | **Projection ∩ permissions** |
| Actions allowed | **RBAC action keys** declared by Experience, enforced server-side |
| AI hooks | **Catalog** declares; **Intelligence** executes; **Projection** scopes |
| Reports / metric keys | **Catalog** declares; analytics consumers aggregate |
| Knowledge bindings | **Tool config** + knowledge admin associations |
| Tasks | **Work Engine** records; Experience declares contribution |
| Live status values | **Engines** |

---

## Granularity

Good Experiences are independently meaningful and recognizable without being one switch per field.

- Good: Temperature Monitoring, Meal Service, Preventive Maintenance  
- Too broad: Service Operations, Work Queue  
- Too narrow: Edit one log field  

If workflows materially differ across departments, prefer distinct Experiences over one ambiguous shared switch with incompatible semantics.
