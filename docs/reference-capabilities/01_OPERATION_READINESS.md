# Capability: Operation Readiness

**Capability ID:** CAP-01  
**Parent:** [00_REFERENCE_CAPABILITIES_INDEX.md](./00_REFERENCE_CAPABILITIES_INDEX.md)

---

## Purpose

Determine whether an **operation can begin or continue safely and successfully** at a site, department, or location — before and during service.

Readiness answers the most fundamental operational question: **Are we cleared to perform?**

---

## Operational promise

The organization can **see readiness as a whole** — not assemble it from memory, radio, and spreadsheets — and act on gaps **before** service fails.

Managers immediately understand operational readiness. Supervisors know **where to walk first**. Employees know **what must be complete before starting**.

---

## Inputs

Readiness synthesizes signals from across the operation:

### Staffing

- Scheduled roles present or coverage confirmed for the operation window.
- Call-downs resolved or explicitly accepted as risk.
- Cross-coverage assignments active.

### Equipment

- Assets required at the location functional or under accepted workaround.
- Critical failures flagged; non-critical issues acknowledged.

### Supplies

- Consumables at point of use meet minimum for the operation.
- Known shortages mitigated or operation scope adjusted.

### Compliance

- Required pre-service and in-service checks complete or on track.
- Failed gates that block safe service surfaced explicitly.

### Knowledge

- Staff briefed on today's differences — menu, protocol, isolation, event.
- Location and equipment quirks accessible to those who need them.

### Environment

- Physical space accessible and appropriate status — clean, clear, safe.
- Blocking conditions (construction, isolation hold, contamination) known.

### Communication

- Handoffs from upstream departments received or delay acknowledged.
- Downstream parties informed of timing or variance.

---

## Outputs

Readiness produces **plain-language states** at site, location, and operation scope:

| Output | Meaning |
|--------|---------|
| **Ready** | Can start or continue with acceptable risk |
| **Not ready** | Preparation incomplete — should not start here yet |
| **Healthy** | Operation in execution — meeting commitment |
| **At risk** | Service possible but degrading — watch or intervene |
| **Blocked** | Cannot meet commitment without recovery or escalation |
| **Recovered** | Was at risk or blocked; workaround in place — variance documented |

Outputs include **reason** (one primary blocker or driver) and **scope** (which operation, which locations).

---

## Users

| User | How they use readiness |
|------|------------------------|
| **Manager** | Site-wide pulse; decide go / hold / recover |
| **Supervisor** | Walk list; validate locations before service |
| **Employee** | Know what must be done before milestone |
| **Support departments** | See upstream/downstream impact on readiness |

---

## Relationships

| Capability | Relationship |
|------------|--------------|
| **Operation Execution** | Readiness gates and monitors execution |
| **Workforce and Coverage** | Staffing is a readiness input |
| **Asset and Location** | Equipment and environment are inputs |
| **Supply and Resources** | Supply levels are inputs |
| **Issue and Recovery** | Blockers often become recovery; recovered updates readiness |
| **Operational Intelligence** | Synthesizes readiness across scope |
| **Operational Knowledge** | Knowledge gaps affect readiness |
| **Analytics** | Readiness patterns over time inform improvement |

---

## Operational rules

1. **Readiness is operation-scoped** — breakfast readiness ≠ lunch readiness.
2. **Readiness is location-specific** — site green with one blocked servery is not "ready."
3. **Compliance supports readiness** — failed safety gate can block even if staff present.
4. **Paperwork ≠ readiness** — complete logs with failing service is not healthy.
5. **Recovered is honest** — partial success visible, not erased to green.
6. **Readiness decays** — states are time-bound; stale readiness is false confidence.
7. **One primary reason** when not ready — clarity over exhaustive failure lists on first glance.

---

## Success criteria

| Criterion | Measure |
|-----------|---------|
| **Immediacy** | Manager understands site readiness in seconds |
| **Accuracy** | Floor reality matches readiness state |
| **Actionability** | Every not-ready/block state implies what kind of action |
| **Prevention** | Blockers caught in preparation, not mid-service |
| **Cross-industry** | Same states apply; inputs configure per vertical |

---

## Future extensibility

- **Readiness profiles** per operation type — what inputs matter for EVS round vs meal service.
- **Automated detection** of missed staffing, failed checks, open blockers.
- **Predictive readiness** — "likely blocked in 20 minutes if delivery not received."
- **Org rollup** — readiness across many sites for operators.
- **Industry pack weights** — which inputs are blocking vs advisory per vertical.

---

## Industry examples

| Industry | Readiness question |
|----------|-------------------|
| LTC | Are serveries ready for breakfast? |
| Hospital | Is nourishment service cleared for this unit? |
| K-12 | Is the lunch line ready for period 4? |
| University | Is retail stocked and temp-safe for rush? |
| Corporate | Is micro-market ready for morning peak? |
| EVS | Are zones clear before clinical access? |
| Plant | Are kitchen-critical assets reliable this window? |
| Laundry | Is clean turn staged for distribution deadline? |
| Hospitality | Is banquet pantry ready for 18:00 service? |

Same capability. Different configured inputs.

---

## Experience alignment

Surfaces primarily through [Operations Center](../reference-ux/01_OPERATIONS_CENTER.md), [Unit Workspace](../reference-ux/02_UNIT_WORKSPACE.md), and [Operational Awareness](../reference-ux/06_OPERATIONAL_AWARENESS.md).
