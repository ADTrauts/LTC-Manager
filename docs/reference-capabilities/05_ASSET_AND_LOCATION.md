# Capability: Asset and Location

**Capability ID:** CAP-05  
**Parent:** [00_REFERENCE_CAPABILITIES_INDEX.md](./00_REFERENCE_CAPABILITIES_INDEX.md)

---

## Purpose

**Maintain and represent operational locations and physical assets** — the places where work happens and the equipment operations depend on.

Without reliable places and assets, execution and readiness collapse.

---

## Operational promise

The organization knows **where work happens**, **what equipment matters at each place**, **whether it works**, and **what history it carries** — so operations are planned and recovered against physical reality, not assumption.

---

## Inputs

- **Location registry** — named places, hierarchy, type, department responsibilities.
- **Asset registry** — equipment tied to locations, type, status, vendor.
- **Maintenance activity** — corrective and preventive work.
- **Issue history** — failures and workarounds from Issue and Recovery.
- **Operational configuration** — meal times, round order, service parameters per location.
- **Knowledge** — location notes, equipment quirks.

---

## Outputs

- **Location catalog** — navigable structure of the site for operations.
- **Location operational profile** — what operations run here, which departments own.
- **Asset status** — active, degraded, out of service, retired.
- **Maintenance state** — open work, PM due, last service.
- **Operational importance** — which assets are **critical path** for which operations.
- **History** — failure patterns, repeat repairs, lessons.
- **Relationship map** — parent/child locations, asset dependencies.

---

## Locations

Locations are **execution anchors**:

- Serveries, kitchens, zones, closets, retail points, staging areas.
- Hierarchical — building → wing → room group where needed.
- **Department responsibilities** — who cleans, maintains, operates.
- **Not** org chart nodes — physical or logical places of work.

---

## Equipment

Assets are **operation enablers**:

- Warmers, chillers, dish machines, HVAC, laundry equipment, transport.
- Status affects **readiness** directly.
- **Criticality** varies by operation — same asset more important at lunch than at 3 AM.

---

## Maintenance

Maintenance connects assets to **long-term reliability**:

- **Corrective** — fix failure (from Issue and Recovery).
- **Preventive** — scheduled cadence to prevent failure during operations.
- PM may be **deferred** as recovery action when operation demands — explicitly, not silently.

---

## Relationships

| Concept | Relationship |
|---------|--------------|
| Location ↔ Operation | Operations execute at locations |
| Location ↔ Department | Departments responsible for readiness dimensions |
| Asset ↔ Location | Assets installed at or serving locations |
| Asset ↔ Operation | Critical assets gate operation readiness |
| Asset ↔ Issue | Failures generate issues |
| Location ↔ Knowledge | Quirks and procedures attach here |

---

## Operational importance

Not all assets and locations are equal **for this operation now**:

- **Critical path** — failure blocks service.
- **Degraded tolerance** — workaround acceptable temporarily.
- **Background** — failure annoying but not operation-stopping today.

Importance is **operation- and time-scoped**.

---

## Users

| User | Use |
|------|-----|
| **Manager** | Configure locations; prioritize plant response |
| **Supervisor** | Know equipment state on walk |
| **Employee** | See what equipment matters here; report failure |
| **Plant / facilities** | Maintain registry; close maintenance |

---

## Relationships to capabilities

| Capability | Relationship |
|------------|--------------|
| **Operation Readiness** | Equipment and environment inputs |
| **Operation Execution** | Milestones at locations using assets |
| **Issue and Recovery** | Asset failures become issues |
| **Supply and Resources** | Storage locations hold supplies |
| **Operational Knowledge** | Location and equipment notes |
| **Analytics** | Reliability trends per asset/location |

---

## Operational rules

1. **Locations are admin-defined** — sites differ; platform does not hardcode layout.
2. **Asset status is honest** — out of service visible to operations, not only maintenance.
3. **History informs readiness** — "warmer fault third time this month" elevates risk.
4. **PM vs operation conflict** — explicit deferral, not silent skip.
5. **One location active context** per floor worker — execution clarity.
6. **Vendor is supporting data** — who services asset, not the operational story.

---

## Success criteria

| Criterion | Measure |
|-----------|---------|
| **Accuracy** | Floor matches registry |
| **Criticality clarity** | Ops knows which failures block service |
| **Maintenance loop** | Issues become closed maintenance |
| **Location discoverability** | Everyone navigates to right place |
| **Cross-industry** | Same capability; location types configure |

---

## Future extensibility

- **Asset criticality matrix** per operation template.
- **IoT status** — live temp, fault codes (integration layer).
- **Spatial grouping** — walk routes for supervisors.
- **Lifecycle costing** — analytics maturity, not execution.
- **Mobile scan** — identify asset at point of work.

---

## Industry examples

| Industry | Location / asset focus |
|----------|------------------------|
| LTC | Servery + warmer + dish |
| Hospital | Nourishment room + rethermalization |
| K-12 | Serving line + milk cooler |
| University | Retail cooler + grab-and-go |
| Corporate | Micro-market refrigeration |
| EVS | Zone + supply closet |
| Plant | Kitchen chiller + PM schedule |
| Laundry | Washer/dryer + staging lane |
| Hospitality | Banquet holding equipment |

---

## Experience alignment

Surfaces through [Unit Workspace](../reference-ux/02_UNIT_WORKSPACE.md), [Operations Center](../reference-ux/01_OPERATIONS_CENTER.md), and [Operational Knowledge](../reference-ux/08_OPERATIONAL_KNOWLEDGE.md).
