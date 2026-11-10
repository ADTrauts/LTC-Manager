# Visual 4 — Manager workflow

**Proposed path.** The shortage is discovered on People & Coverage. The placement is made in Run. The requirement, when it is wrong, is edited in the Coverage draft on this same page.

```mermaid
flowchart TD
  A["Open Department Builder<br/>People and Coverage"] --> B{"Published requirements<br/>for this Department?"}
  B -->|No| C["Today says Coverage<br/>is not configured"]
  C --> D["Add a draft requirement<br/>room, period, role, count"]
  D --> E["Publish<br/>effective next service day,<br/>or a later date"]
  B -->|Yes| F["Today strip<br/>required versus assigned"]
  F --> G{"1B Servery Lunch<br/>2 Server required,<br/>1 assignment"}
  G --> H["Shortage"]
  H --> I["Open Run<br/>assignment board"]
  I --> J["Place a second Server<br/>OperationalAssignment"]
  J --> K["Same evaluator<br/>slot becomes covered<br/>unless a call-off marks it at risk"]
```

Two people on the schedule do not clear the shortage. The second person has to have an `OperationalAssignment` whose role, room, and period match the requirement.

If the manager meant one Server, they change the draft requirement and publish. That does not rewrite today's assignments by itself. The published need applies on its effective date.
