# Visual 5 — Employee workflow

**Current ownership.** These are separate facts. Walking down the page is not a database hierarchy.

```mermaid
flowchart LR
  A["Employee Builder<br/>identity and Job Title"] --> B["Department membership<br/>one person, many Departments"]
  B --> C["Team membership<br/>optional<br/>one primary Team<br/>per Department"]
  B --> D["Operational qualification<br/>zero or many roles<br/>revoke keeps the row"]
  E["Schedule<br/>ScheduleEntry"] --> F["Run<br/>OperationalAssignment<br/>for this service date"]
  C -.->|does not decide| F
  D -.->|allows, does not place| F
  G["RoleKey"] -.->|authorization only| A
```

| Situation | What stays put | What changes |
|---|---|---|
| No Team | Department membership | Organization shows them under No Team |
| Server and Dishwashing | One Team, or none | Two qualifications, not two Teams |
| Covers Utility today, primary Team is Resident Services | Team membership | Today's assignment |
| Also in Environmental Services | Each Department has its own membership, Teams, and qualifications | The other Department's page |
| Team lead | `managerEmployeeId` | RoleKey is unchanged |
| Qualification revoked | The row, status `REVOKED` | They are not shown as qualified |

Employee Builder is where a manager changes membership, Team, lead, and qualifications. People & Coverage links there. It does not save those facts.
