# 06 — Platform Expansion Model

## The claim to prove

> A new department plugs into the platform by composing existing Operational Areas and Experiences from the catalog. It never requires a change to Facility Builder, Projection, or the platform itself.

If this holds, the architecture is genuinely extensible: growth is *configuration*, not *engineering*.

## Why expansion is additive

The layers are designed so that departments are **data**, not **code**:

- Facility Builder knows only Facility → Floor → Neighborhood → Room and which department a room is assigned to. It has no concept of any specific department's operations. Adding Security teaches Facility Builder nothing new.
- The Experience Catalog is a shared library. New departments reuse existing Experiences (Assignments, Scheduling, Rounding, Audits, Forms, Logs, Knowledge, Repairs, Assets) and add only the genuinely novel ones.
- Operational Areas are just named groupings of Experiences. A new department declares its areas and drops Experiences into them.
- Projection resolves Department → Area → Experience → Room generically. It does not contain per-department logic.

So onboarding a department is: **pick areas, pick Experiences, define archetypes, map rooms, certify.** No platform surgery.

## Expansion walkthroughs

### Laundry

```text
Areas:        Processing, Distribution, Linen Inventory, Equipment, Compliance, People
Reused:       Assignments, Scheduling, Assets, Audits, Forms, Logs, Rounding
New catalog:  Linen Par Levels, Wash Cycles, Soiled/Clean Flow
Archetypes:   Soiled Room, Clean Room, Laundry Plant, Linen Storage
Facility Builder change: none
```

### Security

```text
Areas:        Patrol, Access Control, Incidents, Compliance, People
Reused:       Assignments, Scheduling, Rounding, Logs, Forms, Knowledge, Audits
New catalog:  Patrol Routes, Incident Reports, Access Events
Archetypes:   Entrance, Public Area, Restricted Area, Command Post
Facility Builder change: none
```

### Transportation

```text
Areas:        Trips, Fleet, Compliance, People
Reused:       Assignments, Scheduling, Assets, Logs, Forms
New catalog:  Trip Requests, Vehicle Inspections, Routes
Archetypes:   Vehicle Bay, Dispatch, Pickup Point
Facility Builder change: none
```

### Volunteer Services

```text
Areas:        Programs, Volunteers, Scheduling, Compliance
Reused:       Assignments, Scheduling, Knowledge, Forms, Rounding
New catalog:  Volunteer Hours, Program Sessions
Archetypes:   Activity Room, Public Area, Office
Facility Builder change: none
```

### Hospitality / Patient Experience

```text
Areas:        Service, Rounding, Feedback, People
Reused:       Rounding, Satisfaction, Assignments, Scheduling, Knowledge, Forms
New catalog:  Amenity Requests, Experience Rounds
Archetypes:   Guest Room, Lobby, Dining Room, Public Area
Facility Builder change: none
```

### Biomedical

```text
Areas:        Devices, Preventive Maintenance, Compliance, People
Reused:       Assets, Preventive Maintenance, Repairs, Assignments, Logs, Audits
New catalog:  Device Calibration, Recall Tracking
Archetypes:   Clinical Space, Equipment Storage, Biomed Shop
Facility Builder change: none
```

### Administration

```text
Areas:        Facility, Departments, Employees, Assets, Knowledge, Scheduling, Integrations, Organization
Reused:       nearly everything (Administration is a consumer/organizer more than an operator)
New catalog:  minimal
Archetypes:   Office, Public Area
Facility Builder change: none
```

## The reuse dividend

Notice how much repeats across every department: Assignments, Scheduling, Rounding, Audits, Forms, Logs, Knowledge, Assets. These horizontal Experiences are defined once and composed everywhere. Each new department mostly *reuses* and adds only a small set of domain-specific Experiences. This is the payoff of a shared catalog and Operational Areas: the marginal cost of a new department drops toward pure configuration.

## What would break the model (and is therefore forbidden)

- Teaching Facility Builder about a department's Experiences.
- Adding per-department branches inside Projection.
- Creating a new top-level module for each new capability.
- Letting a department invent Experiences outside the catalog.

Each of these reintroduces engineering cost per department. The architecture forbids them precisely to keep expansion additive.

## Conclusion

The architecture scales. Every example department is expressible as areas + catalog Experiences + archetypes + room mapping, with **zero** Facility Builder change and **zero** Projection change. Expansion is a governance and configuration activity, not a development project.
