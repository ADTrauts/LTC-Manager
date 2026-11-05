# Visual 6 — Example Department Builder → Facility screen

Conceptual wireframe for review. Not production UI.

Open [06_facility_ui_concept.html](./06_facility_ui_concept.html) in a browser for the laid-out version. The counts, menu name, and room names are illustrative, matching the November 1 example. They are not a facility extract.

The page composes. The chip on each row is the editor.

## Chrome

```text
Food & Nutrition
------------------------------------------------
Overview | Facility | Operating Rhythm | People & Coverage | Records | Menus

Facility
------------------------------------------------
Physical places and responsibility come from Facility Builder.
This page shows what else applies. It does not classify the room.
```

**Repo vs November 2.** The live tab is still labeled Locations and still binds a Location Function. That editor is scheduled for removal. The card below does not have a function row.

## One room card

```text
1A Naval Park
  Servery                                          Facility Builder →

  Responsibility          Food & Nutrition         Facility Builder →
  Facility Room Type      Servery                  Facility Builder →
  Operating Rhythm        Breakfast                Operating Rhythm →
                          Lunch
                          Dinner
  People                  Resident Services        Employee Builder →
                          Server
                          Lead Server
  Coverage                Breakfast   2 required   People & Coverage →
                          Lunch       2 required
                          Dinner      2 required
  Records                 6 requirements           Records →
  Assets                  4 assets                 Asset Builder →
  Menu                    Spring / Summer          Menu Builder →
                          Resident Menu
```

| Row | On this page | Edit in |
|---|---|---|
| Floor, neighborhood, room name, physical type | shown | Facility Builder |
| Responsibility | shown | Facility Builder |
| Facility Room Type | shown | Facility Builder |
| Cycle definition and participation rules | shown | Operating Rhythm |
| Team and Role | shown | Employee Builder |
| Coverage need and the derived gap | shown | People & Coverage |
| Record requirement | shown | Records |
| Asset | shown | Asset Builder |
| Menu | shown | Menu Builder |

Every row is a drill-down. This page does not author a Department classification. Whether cycle participation is toggled from this card or only from Operating Rhythm is not settled; the wireframe treats the rhythm line as a link. Confirming “apply the same configuration as the other Serveries” would write this room’s id into those owners. It would not store a function key.

## Second and third rooms

Same composition, different owners’ facts. Still no second physical tree.

```text
Main Kitchen
  Production

  Responsibility          Food & Nutrition         Facility Builder →
  Facility Room Type      Production kitchen       Facility Builder →
  Operating Rhythm        Breakfast production     Operating Rhythm →
                          Lunch production
  People                  Culinary                 Employee Builder →
                          Cook · Prep Cook · Baker
  Coverage                Breakfast   3 required   People & Coverage →
                          Lunch       3 required
  Records                 4 requirements           Records →
  Assets                  11 assets                Asset Builder →
  Menu                    —                        not a service menu


Café
  Retail counter

  Responsibility          Food & Nutrition         Facility Builder →
  Facility Room Type      Retail                 Facility Builder →
  Operating Rhythm        Café open                Operating Rhythm →
  People                  Retail                   Employee Builder →
                          Cashier · Barista
  Coverage                Open        1 required   People & Coverage →
  Records                 2 requirements           Records →
  Assets                  3 assets                 Asset Builder →
  Menu                    Retail menu              Menu Builder →
```

A room with no function, no rhythm, and no menu still appears when Facility Builder says the Department is responsible. Empty lines stay empty. The page does not invent a Plant location or a Dietary location to fill them.

## Where the numbers would come from

| Line | Read model input | Not stored on the Facility card |
|---|---|---|
| Place, physical type, and responsibility | Facility tree + responsibility rows | |
| Operating Rhythm | cycles whose explicit locations or function keys include this room | |
| People | Employee Builder team / role once that tree exists; today, team room membership | |
| Coverage | derived need for this room and cycle | the “2 required” is an illustration, not `DepartmentTeamCycle` and not the template item |
| Records | attachments aimed at this space or its function, minus suppressions | the audit has not picked one applicability path |
| Assets | assets whose space is this room | |
| Menu | menus with location applicability for this space | |
