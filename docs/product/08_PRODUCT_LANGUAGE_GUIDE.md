# 08 — Product Language Guide

**Status:** Canonical terminology for UI, docs, and AI prompts  
**Rule:** Prefer one term. Avoid synonym drift.  
**Plug-in contract:** [Current foundation](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026), including the [October 29, 2026 amendment](./01_PRODUCT_CONSTITUTION.md#foundation-amendment--october-29-2026), [01A](./01A_DEPARTMENT_BUILDER_FOUNDATION_AMENDMENT_2026-11-01.md), and [01B Phase 1](./01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md). Words that must stay apart are defined there and repeated in the domain table below.

**Retired terms (do not teach as forward product language):** Location Function, Operational Type (as Department room classification), Work Plan / Expected Work / Recurring shared Work (generic), Department Job Role capabilities. Residual UI copy may still say these until Phase 2; treat them as compatibility debt.

---

## Product name

| Use this | Do not use as the product name |
|----------|-------------------------------|
| **Vssyl** | LTC Manager, Harbor, LTC Corp |
| **Vssyl Console** | Harbor Console, Staff desk *(as product name)*, LTC Corp console |
| **Business Operations Platform** (descriptor) | Long-term care nutrition software *(as the product identity)* |

A Department Product is a Vssyl-authored operating model. A Department is the facility’s local installed instance and local name. Food and Nutrition is the Product. Healthcare is the industry it belongs to, not part of the name. A new install is named Food and Nutrition. A facility may rename that Department. These are not synonyms for Vssyl.

---

## Operating Workspace (shell)

| Use this | Do not use as synonym |
|----------|----------------------|
| **Workspace** | The active operating context: Internal Facility, Organization, or Partner Facility |
| **Mode** | Run, Build, or Admin. Never call these Workspaces |
| **Department** | Subordinate operational lens under a Facility or Partner Facility workspace |

Do not label Run / Build / Admin as Workspace. Do not treat Department, My Account, My Access, Harbor, or Quick PIN as a Workspace. Business Workspace is a retired home. It is not the shell Workspace selector.

**Switch workspace** is the shell chooser. It lists current enterable Workspaces from the available-context directory and enters one `contextKey` through `enterContext`. It is not My Access and does not create authority.

**My Access** remains the detailed inventory at `/access`. The selector includes View My Access. Quick PIN never sees Switch workspace. Harbor is out of scope.

## Homes and zones

| Use this | Do not use as synonym |
|----------|----------------------|
| **Dashboard** | Manager Dashboard, Home Console, Mission Control. The home for Supervisors and above |
| **Business Workspace** | A retired home. Its address opens the Dashboard |
| **Operations Center** | Global Dashboard, Command Center. Retired peer destination |
| **Today's Work** | A retired home. Its address opens the Dashboard; handoffs and rounds live in Schedule and Locations |
| **Unit Workspace** | Unit Dashboard, Location App |
| **Locations** (nav) | Units list *(schema may still say Unit)* |
| **Administration** | Settings (unless form-level), Backend |

---

## Domain words

| Use this | Meaning | Avoid |
|----------|---------|-------|
| **Facility** | Operational site | Site *(vision alias — migrate language to Facility)* |
| **Organization** | Canonical company entity (Facility parent and/or Department operator) | Company, Tenant *(unless billing copy)*; do not invent ManagementCompany / OperatorCompany tables |
| **Parent Organization** | Organization that owns/groups the Facility | Treating a contracted department operator as the Facility parent |
| **Operating Organization** | The company that runs one Department for a period of dates. Customer language for a company other than the facility's own is **vendor-run**. | A stored self-operated switch; a repair vendor; the parent Organization |
| **Partner Organization** | External Organization with an explicit Facility partnership | Inferring partnership from operators, vendors, or parent Organization |
| **Partner Department Scope** | Departments explicitly authorized under a partnership (timestamp periods) | Auto-syncing from Operating Organization; undated permanent rows |
| **Organization member / Organization administrator** | `ORG_MEMBER` / `ORG_ADMIN` on membership role periods | Facility Administrator; Vendor admin; putting ORG_* on RoleKey; inferring a partner Facility role |
| **Client assignment** | Organization-governed partner Facility access for a current Organization member when the Facility has delegated staffing | Organization membership; My Access; permissions; treating Portfolio visibility as assignment |
| **Client assignments** | Person-first list of current client relationships for one member at `/organization/<id>/members` | A new Assignments or Staffing tab; a second assignment engine |
| **Home Facility** | Optional `User.facilityId` presentation marker | Active Facility; login or session authority; rewriting home on Facility switch |
| **Active Facility** | Session/JWT Facility context | Persisting active Facility by mutating `User.facilityId` |
| **Available Context** | A current enterable Organization, internal Facility, or partner Facility relationship for one User | Treating Employee, PIN, Harbor, or a Department as a workspace; merging internal and partner at the same Facility |
| **Account Session** | Authenticated User with no workspace authority | Treating account as Organization/Facility permission; a second identity cookie |
| **Context Session** | The one selected Organization, internal Facility, or partner Facility workspace | Merging contexts; inferring partner vs internal from Facility id alone |
| **My Access** | Where I can work — User-facing directory of current enterable contexts at `/access`. Open live-revalidates through `enterContext`. | Facility `/account`; PIN or Harbor entry; inventing rows from topology or home Facility; a second header chooser |
| **Organization Portfolio** | Facilities and operating relationships visible to the current Organization at `/organization/<id>`. | A second My Access; a cross-Facility Run dashboard; treating org visibility as Facility authority |
| **Owned Facility** | Facility whose parent is this Organization (`Facility.organizationId`) | Inferring ownership from partnership or Department operation |
| **Portfolio visibility** | Organization-level relationship visibility. Not personal Facility authority. | Synthesizing Open or Path A/B from membership or ownership |
| **My Account** | Who I am and how I sign in — global User profile at `/account` and password/security at `/account/security`. | Facility Admin; Employee HR; Home Facility as identity; PIN management |
| **Display name** | Global User presentation field `User.displayName`. A change remints the current session and does not increment `sessionVersion`. | Employee first/last name; Home Facility; treating name as authority |
| **Sign out** | Revokes this browser's User credential (`jti`) and clears its `ltc_session`. Other User sessions stay. Personal push subscriptions for the User are revoked. A User token with no `jti` cannot be used; signing one out increments `User.sessionVersion`. | Sign out everywhere |
| **Sign out everywhere** | Increments `User.sessionVersion` and clears this cookie. All User JWTs die. PIN and Harbor stay. | Sign out other sessions; a device/session inventory |
| **PIN / PIN access** | Workplace authentication for one Employee context (`Employee.sessionVersion`). Not a separate human identity. | Treating PIN-only as a person without a Vssyl account; signing PIN out by changing User password or Sign out everywhere |
| **Vssyl account** | Persistent global person identity (`User`) used to sign in and hold contexts. The account stays with no facility, after leaving a facility, or with only partner access. `User.email` identifies that person and is not issued again. | Global User in customer copy; “full account” vs “PIN-only user”; a second User for an email already in use |
| **Account activation** | Setting a password and verifying email so the Vssyl account can sign in globally | Per-Facility activation; treating invite resend as a new 30-day clock |
| **Account active** | Vssyl account is activated (`isActive` + password + verified email) | Linked, identity link, UserFacilityAccess |
| **Activation pending** | Vssyl account exists but is not yet activated; PIN access still works during the 30-day grace | Invitation pending as the customer status for a linked User |
| **Activation overdue** | 30-day activation grace from account creation has ended; PIN access is blocked until activation | Employment ended; Invalid PIN; Access revoked |
| **Current context** | The workspace I am presently acting within. Displayed from the live session. | Treating a stale available-context list row as authority; exposing scopeKind / Path A / Path B |
| **Password login** | Credentials authenticate the User. Post-auth routing uses available-context count. | Facility-native vs organization-only identity class; repairing grants from `User.facilityId` / `User.roleId` |
| **routeAuthenticatedUser** | Canonical 0 / 1 / many landing after generic User authentication | A second context engine inside login; auto-picking home, first, or highest role; forcing invites through 0/1/many |
| **enterGrantedContext** | Enter one explicit created/accepted context; missing target recovers to account `/access` | Listing every context first; minting from `User.facilityId` / `User.roleId` |
| **enterContext** | Live target revalidation and exclusive session mint from any User session | Listing every context then trusting a posted role; silent fallback to another workspace |
| **Client Facility** | Current `FacilityPartnerOrganization` relationship, or a partner Facility workspace entered via that partnership | Inferring partnership from operators, vendors, or parent Organization; treating org visibility as personal entry |
| **Repair vendor** | The company called to fix one piece of equipment | The operating partner; a vendor-run Department; a partner company |
| **Vendor account** | A person from the operating partner, signed in on the partner workspace | A repair vendor; a Facility Administrator |
| **Self-operated / Vendor-run** | Derived from the operator: the facility's own company, or another company. Never a stored switch. | A persisted operating-model switch |
| **Vssyl Console** | Vssyl's own desk at `/console`. It creates a customer facility, creates a partner company, invites that company's first people, and publishes Catalog forms. | A customer workspace; Harbor as the product name |
| **Marketplace** | Where a facility adds ready-made content inside a Department it already installed. The items run on Platform engines. | A second catalog; a new Department Product; a store of engines |
| **Marketplace item** | A Records form, Operating Rhythm starter, or Menu template. Included or Paid. Work presets are not forward Marketplace items. | A Department; a license; generic Work |
| **Facility Administrator** | The one person who governs the facility account. Views a self-operated Department unless they are its head. Sees a vendor-run Department as a summary plus compliance Records. | Several Facility Administrators; operating every Department |
| **Department head / GM** | The person who runs one Department | The Facility Administrator by default |
| **Operator period** | The dates one company runs a Department | A permanent operator flag |
| **Department Product** | Vssyl-published operational product (Food and Nutrition, Environmental Services, Facility Plant Operations) | Industry pack, Experience, blank “create any department”, using a local Department name as the Product name; generic **Maintenance** as a Product name |
| **Department** | Facility-installed instance / operational ownership | Line of business |
| **Enabled** | `Department.isActive` — admitted to shared operations | Operationally active, configured, ready, healthy |
| **Operating rhythm** | Recurring Operational Cycles the department runs | Shift, schedule ceremony, setup steps |
| **Location Function** | **Retired.** Do not use in new UI. Historical: Product `functionKey` on a Department profile. Forward: Department responsibility + canonical Unit/UnitSpace ids on each engine. | Operational Type, Archetype, room classification, function key as a live target |
| **Operational Cycle** | Root recurring window (persisted as root PERIOD) | Peer “Breakfast Cleanup” as a top-level operation, meal milestone engine |
| **Phase** | One interval inside an Operational Cycle (persisted as nested PERIOD) | Sub-operation, peer cycle |
| **Key Point** | Instant on a Cycle (persisted as `KEY_TIME`). Overdue means REQUIRED, past the expected facility-local minute, with no actual. The attention event id is `milestone.overdue` | Key Time in current product language, Work, a Record, calling an untracked planned time overdue |
| **Records** | Manager umbrella for Reading, Checklist, Inspection, Acknowledgement, and On-demand Record. One engine. Definition is `CatalogLogDefinition`. Facility requirement is `LogAttachment`. The fact is `OperationalEvidenceRecord`. | Logs and Inspections as separate canonical engines; treating `OperationalTemplate` as the next layer after Catalog; Evidence in manager language |
| **Corrective action** | The text on a Record describing what was done when the reading was out of standard. It is history, written at submission. Later work is a recheck Record, an Issue, or a Work Order. The out-of-standard submission can inform the on-duty supervisor as an Update. That Update is not an assigned review | A due task, a second workflow, or a rewrite of the original Record into a pass |
| **Logs** (due work) | `/staffing/logs` when canonical Logs are on — what must be recorded now | Using Log Book as the due-work queue; treating legacy `/logs` as the forward Record surface |
| **Log Book** | `/staffing/log-book` — projection over submitted `OperationalEvidenceRecord` rows | A second evidence store; merging Log Book with due Logs |
| **Audit / Reports** | Expected versus actual for a service date or range. Route may remain `/reports`. | Review as a workspace |
| **People & Coverage** | Department Builder section for teams and coverage | Teams as a peer top-level product, a second people system |
| **Participating location** | Room explicitly attached to a cycle | Department-responsible room *(responsibility ≠ participation)* |
| **Work applicability** | **Retired with generic Work.** Do not use for new design. | Assignment, cycle participation, department responsibility *(each remains separate)* |
| **Menu** | Department-owned food offering identity plus its content | Facility singleton, Operational Cycle, recipe catalog |
| **Menu applicability** | Explicit Department locations and canonical Operational Cycles where a Menu may be used, including the Menu period mapped to each Cycle | Live “all locations” rules, neighborhood inheritance, binding a published cycle row id |
| **Menu Runtime resolution** | Exact location + date-effective root Operational Cycle occurrence + facility service date + ACTIVE applicability + stored `menuPeriodKey` + rotation | Winner/priority, location inheritance, MealType matching, wall-clock “current meal”, historical snapshots, temperature/log integration |
| **Menu rotation** | Week / day position inside `MenuCycleSettings` | Operational Cycle timing |
| **Healthy quiet** | Rhythm and participation exist; no operation is active now | Not configured, missing rooms, idle, complete |
| **Make live** | Publish configured cycles so Run can use them | Review & Publish, Submit for Review |
| **Room / Space** | Area within a unit; model is `UnitSpace` | Location *(reserve for section level; see `docs/location-architecture/`)* |
| **Location / Unit** | Place of work — UI “Location”, model often `Unit` | Room *(unless truly a resident room entity)* |
| **Operation** | Time-bound service commitment | Shift *(shifts are coverage; operations are service windows)* |
| **Expected Work** | **Retired** as a generic platform concept. Prefer Records due, Work Orders, PM, or Rhythm timing. | Tasks due, inbox, job list, catch-all work |
| **Work Plan** | **Retired / compatibility-only.** Residual `DepartmentWorkPlan` configuration until Phase 2. | Job, checklist catalog, forward shared Work |
| **Recurring Work** | Do not use as a platform noun. Say Records rounds, Operating Rhythm, or Preventive Maintenance as appropriate. | Treating rounds as Preventive Maintenance; treating Work Orders as shared Work |
| **Job Flow / My Work** | Person-scoped **composition** of Assignment, Cycle window, Records due, and assigned maintenance — stores nothing | Today's Work as a peer home; a MyWorkItem table; requiring generic Work Plans |
| **Task** | **Retired.** Not a forward projection. | Ticket *(unless issue context)*; recreating generic Work |
| **Request** | Intake: someone is asking for maintenance attention | Treating a Request as the problem itself or as a Work Order |
| **Issue** | A known undesirable condition. May exist without an Asset or a Work Order. Creating one can inform the on-duty supervisor as an Update. That Update is not an assignment, and the Issue's priority is not the notification's priority | Ticket, Incident *(unless safety-legal context)*; collapsing Issue into Request or Repair |
| **Work Order** | Facility Plant Operations accepted maintenance work with a persistent lifecycle. Priority, response requirement, deadline, and assignee are separate facts on this Work Order | Generic shared Work; Repair as the manager-facing noun |
| **Work Order priority** | Queue ordering: Routine, High, Urgent, Emergency. Stored `LOW` and `MEDIUM` present as Routine. Emergency is a queue class | Treating Emergency as immediate response, or copying the queue class onto a notification |
| **Response requirement** | Whether this Work Order requires immediate operational response: Standard or Immediate. The Work Order screen uses those words. Immediate is the active condition while the Work Order is open. That opening tells On-Call Coverage with Urgent attention. It does not make the notice Critical or protected | A second Emergency word, a safety flag stored as notification priority, or a Department-specific emergency type |
| **Work Order deadline** | When the work should be completed. `dueAt` is that instant. The planning date is not the deadline | Using the deadline as the response requirement |
| **Repair** | Persistence name for the Work Order row (`Repair`, `/repairs`) | Using Repair as the Product name for Issue or for Facility Plant Operations |
| **Preventive Maintenance Plan** | Published maintenance rule for a specified target and fixed cadence | Operational Cycle; rolling next-due as the Product definition of PM; recurring facility rounds |
| **Finding** | Inspection item outcome needing follow-up | Defect *(unless manufacturing)* |
| **Inspection** | A Record form inside the one Record engine | A second inspection engine; Audit / Reports |
| **Knowledge** | Operational SOP/reference | Wiki, CMS |
| **Asset** | Shared Platform equipment / built-environment object. Out of service means the Asset cannot perform its function. Returned to service means it can participate again, including when the status is degraded. That is an Asset status, not an Issue impact and not a failed Record. The responsible organization is not a person | Device *(reserve for PIN tablets)*; PlantAsset / MaintenanceAsset |
| **Asset lifecycle** | Registry status such as operational, out of service, retired | Treating lifecycle as the same fact as observed condition |
| **Asset condition** | Observed operating condition, updated from work and inspection facts | Treating condition restore as an automatic Work Order closeout |
| **Facility Plant Operations** | Department Product for maintaining the built facility environment | Generic Maintenance as the Product name; treating manufacturing/fleet/biomedical maintenance as this Product; using the local Department name as the Product name |
| **Plant Operations** | Default local Department name for an installed Facility Plant Operations Product | Official Product name |
| **Employee** | Facility-specific workforce/employment record. One Vssyl account may have many Employees; at most one Employee per account per Facility. New Employees are always account-backed. | Treating Employee as the global person identity; inferring identity from email; PIN-only as a permanent person type |
| **User.role** | Compatibility / home-default Facility RoleKey only. Active internal authority is the current `UserFacilityRolePeriod` for the selected Facility grant. | Treating `User.roleId` as the RoleKey at every Facility; Employee.roleType; job title |
| **Call-off** | A mark on the shift: that person is not working that whole shift. Coverage stops counting the overlapping Assignment. The Assignment row stays. Coverage, not a separate call-off notice, tells the supervisor the staffing consequence | Call-down as the name of the shift mark, or a second alert for the same gap |
| **Supervisory responsibility** | The Assignment that says who is supervising this Department and location during a service window. A called-off shift removes that person. A later Assignment replaces them | The Supervisor role, the Department head, or a Dietary-only supervisor id |
| **On-call coverage** | The Assignment that says who must respond to an operational incident for this Department during a time window. An Asset taken out of service is one such incident. A called-off shift removes that person while the call-off covers that instant | A job role, the Department head, the Work Order assignee, the Asset owner, or a separate on-call roster |
| **Coverage episode** | One continuous coverage deficiency for one slot. Coverage owns when it opens, worsens, and closes. The Coverage answer itself stays derived | A stored Covered flag, or a notification deciding that a new incident began |
| **Scheduled Evaluation** | The platform clock that asks a domain whether time passing changed an operational fact | A rules engine, or a notification deciding that Coverage became uncovered |
| **Notification** | An attention-delivery record for one condition or communication. It does not own the operational fact | A second Coverage, Readiness, Record, Asset, or Work Order row |
| **Attention** | The platform's request that a person be aware or act. Operational attention is the bell. Dashboard Attention is the supervisor home's current list | Using the bell as a raw unread counter of chat plus risk |
| **Communication** | Human messages. Future Chat. Unread and read | Operational acknowledgement as the meaning of reading a message |
| **Priority** | How much attention a notification requests: Update, Needs Attention, Urgent, Critical | Inferring priority from message wording; using role as the severity |
| **Update** | Notification priority for useful information that does not require immediate action | A readiness state |
| **Urgent** | Notification priority for time-sensitive operational intervention | A Work Order priority copied across without the attention policy |
| **Critical** | Rare notification priority for safety, regulatory exposure, or major service continuity | Calling every severe-looking event Critical |
| **Protected notification** | Attention the person cannot turn off in the app. It cannot be snoozed, quieted, or digested. External channels may still be configurable when it is not protected | A user setting that hides active uncovered coverage or a critical safety failure |
| **Response Policy** | What may happen after an attention thread exists: escalation eligibility, duty reconciliation eligibility, snooze, quiet, and digest. It does not choose the priority, the first recipient, or the deadline | A settings screen, or a second reading of Work Order priority or Asset criticality |
| **Responsibility Reconciliation** | Adding the person who holds an open thread's primary operational responsibility now. Duty is read at the evaluator's current time. Earlier recipients stay | Escalation, removing the person who received it when it opened, or changing the notification's priority |
| **Recipient reason** | Why this person received this notification | A department-specific notify function as the explanation |
| **Read** | The recipient has viewed the notification | Acknowledgement; resolution |
| **Acknowledged** | The recipient has accepted responsibility. Escalation can stop. The condition can still be open | The condition being fixed |
| **Snooze** | Suppressing later external interruption for one recipient until a bounded time. The Center item and the bell stay | Acknowledgement, hiding the item, or stopping escalation |
| **Quiet Hours** | A personal Facility-local window during which informational Updates do not interrupt this browser. The Center item stays | Hiding Needs Attention or higher, muting every alert, or changing who is responsible |
| **Informational Updates** | Update-priority attention. Quiet Hours can apply to it. Needs Attention and higher are not informational | A readiness state, or a label for Urgent and Critical attention |
| **Pause browser alerts** | Snooze for this person on this notification. Browser interruption pauses. The Center item and the bell stay | Dismiss, hide, acknowledge, or resolve |
| **Resume browser alerts** | Clear this person's Snooze. The item stays. It does not mark read, acknowledge, or resolve | Turning the operational condition back on |
| **Digest Eligibility** | An Update may later be batched instead of sent alone. Needs Attention and higher are not eligible in V1 | An email that is sent today, or a dismissal |
| **Browser alerts** | Operational attention shown by this personal browser. The Notification Center still holds the item | A shared-tablet channel, or a replacement for the Center |
| **Enable alerts on this device** | The person's choice to allow browser alerts on the browser they are using | A prompt at sign-in, or a setting that covers every Facility tablet |
| **Disable alerts on this device** | Stopping browser alerts on this browser. The Center item stays | Hiding attention, or acknowledgement |
| **Escalation** | Adding the Department head to an active operational thread because no primary-responsibility recipient acknowledged by the deadline. One tier. It does not raise priority | Raising Needs Attention to Urgent or Critical, a second tier, or a facility setting |
| **Escalated** | That Department head was added. The deadline passing, by itself, is not Escalated | A new unrelated notification, or a higher priority |
| **Resolved** | The owning domain confirmed the condition ended | Read, acknowledgement, or task completion by themselves |

---

## Readiness language

| Use this (UI) | Internal may remain |
|---------------|---------------------|
| **Ready** | `ready` |
| **In Progress** | `in_progress` |
| **Needs Attention** | `blocked` |

Never show **Blocked** to end users. Never say **Complete** for readiness green.

---

## Notification and attention language

Three scales stay apart. The canonical engine is [16 — Notifications & Attention](./16_NOTIFICATIONS_AND_ATTENTION.md).

| Scale | Words | Owner |
|-------|-------|-------|
| Operational condition | Coverage: Covered, At Risk, Uncovered, and the other coverage words. Readiness: Ready, In Progress, Needs Attention. Asset, Record, and Work Order words stay with those domains | The domain that owns the fact |
| Notification priority | Update, Needs Attention, Urgent, Critical | Attention policy |
| Delivery interruption | Notification Center, attention badge, push, email | Delivery policy |

**Needs Attention** is both a readiness word and a notification priority. Name which one: "Readiness is Needs Attention" is the place. "Priority is Needs Attention" is the notification.

The policy events `readiness.became_at_risk` and `readiness.became_degraded` are internal names. They do not add readiness states called At Risk or Degraded. **Degraded** remains an asset-condition word when the speaker means the asset.

**Dashboard Attention** is the supervisor home's composed list (`act_now`, `due_soon`, `watch`). It is not a Notification, and it is not the bell count.

---

## Workspace language

| Use this | Avoid |
|----------|-------|
| **Manager Focus** | Top Priorities *(as section title — Priorities may exist as optional list)* |
| **Management Agenda** | Calendar, Schedule *(no RRULE)* |
| **Quick Actions** | Shortcuts Dock |
| **Current operations are on track.** | All clear / Green day / No problems |

---

## AI language

| Use this | Avoid |
|----------|-------|
| **Morning Brief** | AI Summary (unless origin is fallback Operational Summary) |
| **cached** | Live AI when showing Workspace peek |
| **Operational Summary** | Only for non-AI fallback origin |

---

## Consolidation recommendations (docs; code later)

1. Prefer **Request**, **Issue**, and **Work Order** as distinct nouns. Keep `/repairs` until routes converge; do not revive Repair-as-Issue façade copy.  
2. Prefer **Facility** over Site in new docs.  
3. Prefer **Needs Attention** everywhere readiness is user-visible.  
4. Stop calling Workspace “Wave 12 Industry” — that overloaded the roadmap term.
