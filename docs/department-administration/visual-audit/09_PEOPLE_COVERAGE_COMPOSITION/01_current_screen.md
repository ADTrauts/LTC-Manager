# Visual 1 — Current People & Coverage screen

**Current behavior.** Reconstruction from the mounted components. The browser session aborted before `/build/departments/{id}?tab=people` rendered, so this is not a screenshot and not a facility's data.

Open the [reconstruction](./01_current_screen.html).

The page is Department Builder with the local nav Overview, Facility, Operating Rhythm, People & Coverage, Records. People & Coverage stacks two editors.

```text
People & Coverage
├── People                         TeamsPanel → TeamsWorkspace
│     split list of Teams
│     create, rename, lead, archive
│     member count and "View employees"
│     does not list people or qualifications
└── Coverage                       CoveragePanel → CoverageWorkspace
      list of working expectations
      drawer: draft name, requirements, publish
      no required-versus-assigned column
```

Names in the reconstruction are illustrative: Resident Services, 1A Servery, Server. They are not a reading of a database.

## What a manager can do

| Control | Writes |
|---|---|
| + Add Team, Create Team, Save Team, Archive Team | `DepartmentTeam` and its lead |
| View employees | Nothing. Link only |
| + Add expectation, Create draft, Save draft | `OperationalAssignmentTemplate` |
| Add requirement, Remove | `OperationalAssignmentTemplateItem` |
| Publish | Status, `publishedAt`, `effectiveFrom`, and the prior version's end |

## What the screen does not show

Department head, Job Title, primary Team, a person with no Team, qualifications, today's assigned count, or a link to the assignment board.
