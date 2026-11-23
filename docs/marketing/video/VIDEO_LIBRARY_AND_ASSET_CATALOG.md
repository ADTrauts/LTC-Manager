# Vssyl Video Library & Asset Catalog

**Status:** CURRENT production inventory, established November 23, 2026.  
**Scope:** approved film masters, reusable visual direction, narration sources, scripts, production derivatives and future concepts.  
**Storage warning:** file names and hashes listed here identify conversation-uploaded assets inspected during documentation; **they are not durable repository URLs**. Originals are not committed. A separate asset-storage decision and transfer are required.

## 1. Film register

| ID | Title | Creative status | Duration / export | Content | Record |
| --- | --- | --- | --- | --- | --- |
| VSSYL-VID-001 | **The Day Doesn't Wait** (V15 final end card) | **Final creative approved** by product owner, November 23, 2026 | **142.000 sec; H.264 / AAC; 1280×720; 25 fps** | Food & Nutrition morning, staffing gap, 48°F refrigerator, human-led response, breakfast-to-lunch rhythm, People/Places/Work/Time | [V15 case study + script](THE_DAY_DOESNT_WAIT_V15.md) |

**Creative approval ≠ verified commercial clearance.** Publication status, public URL, licensing audit, music ownership and claims review for an external campaign were not established by this inventory.

## 2. Source asset inventory

All file names below were visible in the project/conversation working materials on November 23, 2026 and independently checked for presence. The files presently exist as chat/container assets, not as media uploaded to GitHub, object storage or Drive.

### A. Must-archive first: approved final

| ID | Exact source filename | Evidence | Role | Storage status |
| --- | --- | --- | --- | --- |
| V001-MASTER | Vssyl-The-Day-Doesnt-Wait-V15-End-Card.mp4 | 16,979,551 bytes; SHA-256 **4029258741f8176af3003961d5779ba64a5c8492e6c169daa8acdd953a8efcb1** | Approved 2:22 picture+audio release candidate | **PENDING DURABLE ARCHIVE** |
| V001-VOICE-APPROVED | Generated Audio November 22, 2026 - 10_07PM.wav | 6,643,244 bytes; SHA-256 **a649d22a4bf9e602cbfda6f710cb171bb41c35c565e43f8c3b4f2b25d603a542** | User-approved final full narration source; mono 24 kHz PCM, 138.4 sec | **PENDING DURABLE ARCHIVE** |
| V001-SCRIPT-V15 | Exact narration transcribed in [V15 case study](THE_DAY_DOESNT_WAIT_V15.md) | Approved by product owner in conversation | Copy-editable approved V15 narrator copy | **IN REPO** (in case study) |

**Final video observed properties:** width 1280, height 720, frame rate 25/1, video H.264, stereo audio AAC at 48 kHz, 142-second container duration. Embedded music and graphics are mixed into the final file. The separate raw final music stem, editor project and a verified final caption transcript have not been identified as durable masters.

### B. Approved art/motion references

| ID | Exact working filename | SHA-256 | Reuse | Source status |
| --- | --- | --- | --- | --- |
| VSSYL-ART-001 | a_clean_modern_pastel_isometric_isometric_like.png | 973010f9dc47c4f6ab050bcb337ba069fa7d68862359909f48af4ac19189a135 | Approved neutral, multi-department 2.5D facility direction (image 2) | AI-generated reference; flattened PNG |
| VSSYL-ART-002 | dawn_at_the_care_facility.png | 16db837f7bd3a2c41c718cf0dc9d4a4c06e6c3858a0f7c88c689f6a36aef3420 | Early-morning facility composition | AI-generated frame; flattened PNG |
| VSSYL-ART-003 | 48_f_fridge_alert_at_dawn.png | bbbc2415e981d9c21be0d7f7530c18b1324c8238a93e535e44de6fa7b00cbfc9 | Temperature incident, out-of-range alert | AI-generated frame; flattened PNG |
| VSSYL-ART-004 | frame_4_visible_operation_connected_awareness.png | e6676c830a26edd85eadd7ac5b62408f0c3dc1bf50c3b6dbd453f2b6d83d15f2 | Multi-department visualization of issue and response | AI-generated frame; flattened PNG |
| VSSYL-ART-005 | people_places_work_time.png | 010d28d71a38d75fbfbe1311d6fdc0769c1c4499f795abb2ac51ec1877601861 | High-hierarchy People/Places/Work/Time closing-slide concept | AI-generated art; flattened PNG |
| VSSYL-ART-006 | what_vssyl_connects.png | 27a39038e0ce2d31f592428f3c4e49c34293fccfd3400cf45ff6d0cd9e9852ba | Simplified four-part message composition | AI-generated art; flattened PNG |
| VSSYL-ART-007 | Vssyl_Closing_Animation_Contact_Sheet.png | daad8303e65f08e42c75e0ec4c28e2b8a4b57e806418dcbc5444b853b2ec9c72 | Original word-reveal timing reference | Frame contact sheet, not source animation |

**Important:** Approved art direction means the *style* is approved. These PNGs are not proof of editable layers, 3D scene geometry, transparent character sprites or commercial rights. Reproduce future imagery from the actual approved frame references, not from a newly improvised facility.

### C. Prior edit and audio development references

The following files are archived-in-progress **working versions**, not approved replacements for V15:

| Filename | Reason to retain | Status |
| --- | --- | --- |
| Vssyl_Opening_Motion_Test_v1.mp4 | Dawn/opening pacing study | Working |
| Vssyl_Motion_Study_02_Operational_Response.mp4 | Call-off/refrigerator-response development | Working |
| Vssyl_Motion_Study_03_Connected_Perspectives.mp4 | Employee/supervisor/manager reveal concept | Working |
| Vssyl_Motion_Study_04_Breakfast_to_Lunch.mp4 | Service-cycle transition concept | Working |
| Vssyl_Closing_People_Places_Work_Time_v1.mp4 | Four-word sequential reveal reference | Working |
| Vssyl_The_Day_Doesnt_Wait_V10_Narration_First.mp4 | Subdued-music direction / earlier scratch voice | Superseded picture/audio |
| Vssyl_The_Day_Doesnt_Wait_V11_Narration_First_Master.mp4 | Caption/voice review predecessor | Superseded |
| Vssyl_V9_Refined_Option_A_Music_Review.wav | Earlier music direction sketch; **not certified as the final music stem** | Working |
| Vssyl_V11_Production_Pickups_and_Screen_Capture_Guide.txt | Actual-UI replacement and production checklist | Historical reference |

These derivatives are not uploaded to Git. Archiving all of them is optional; the final master, approved voice file, final script and genuine edit/source project are the priority.

## 3. Persistent storage and licensing ledger

**Storage decision:** OPEN. Suggested properties for the eventual store: owner-controlled access, immutable final versions, shared preview links that can be revoked, clear creative-license provenance, backups and unique asset IDs. An object store, restricted shared drive or properly configured Git LFS could be considered separately. Do not claim a persistent media URL until uploaded and verified.

**Rights/attribution:** NOT YET VERIFIED for final voice generation, music bed, AI-generated illustrations and any stock references. The producer must inspect the actual source/provider agreement for commercial advertising use and record grants, fees, credits and restrictions here. This package makes **no licensing warranty**.

**Editable source files:** NOT VERIFIED. The final MP4 and individual flattened illustration frames do not substitute for a layered design/video editor project. Before a large new campaign, identify the actual final timeline project, original overlays/logos, music stems and font references without redistributing proprietary font files.

**Privacy:** The approved creative storyboard uses fictional/staged facility, employee, time and record examples. Reconfirm the final master contains no identifiable real resident or customer data before public use.

## 4. Permanent reusable asset targets

These are library **targets**, not a claim that editable masters already exist.

| Group | Intended source assets |
| --- | --- |
| Master facility | Whole building, stable cutaway, floors/rooms, entrance and kitchen zoom states |
| Food & Nutrition | Walk-in refrigerator, oven, central kitchen, servery, dining area, serving carts |
| Plant | Mechanical room, equipment, service request, separate work-order and asset-condition states |
| EVS future concept | Resident rooms, corridors, supply cart/housekeeping; concept only until release |
| People | Role-consistent employees, supervisor, manager, optional Plant technician, tablet |
| Operational UI | Clock and time windows; Record; status; shift/Assignment/coverage; Request and WO; service milestone |
| Closing graphics | Large People, Places, Work, Time cards/reveals; final Vssyl wordmark and tagline |
| Audio | Natural narration stem, subdued optimistic music stem, optional minimal SFX |
| Product proof | Sanitized real screen recordings tagged with application commit/release and authority context |

Each asset needs: **asset ID, owner, filename, version, durable path, source application, usage/license, approved artwork, editability and linked film(s)**.

## 5. Next-video idea register (unproduced)

| Candidate | Main story | Product emphasis | Notes |
| --- | --- | --- | --- |
| The Call-Off | Scheduled staffing differs from actual coverage | People + Place + Time | Make adjustment explicitly human, role/eligibility accurate |
| The Refrigerator Isn't Holding Temperature | 48°F reading through corrective action and Plant response | Record + Asset + Request + WO | Food safety human-led; no automatic WO or RTS |
| The Manager's Morning | What should a manager review first? | Scoped Dashboard and exception priorities | Product footage must reflect current app |
| Build the Plan. Run the Day. | Planned cycles vs actual service | Facility configuration, Run, history | Distinguish Build drafts from published Run |
| A Day in Food & Nutrition | Preparation through closeout and next cycle | Timing, service milestones, historical truth | Longer product explainer |
| The Work Behind Care | The people behind invisible physical services | Brand/human story | Quieter, warmer score may fit |
| One Facility, Several Departments | Shared physical world, different responsibilities | Current Food & Nutrition + Plant; EVS future | Strict availability disclosure for EVS |
| The Employee Experience | What matters now and next on a shared tablet | Job Flow | Verify current UI and offline states |

No release dates, production budgets or launch outcomes are committed by this backlog.

## 6. Archive intake checklist

For every asset moved to durable storage:

1. Verify that the uploaded bytes match the SHA-256 in this catalog.
2. Add the **real** persistent URI and its access classification.
3. Record authoritative owner, source/provider, applicable commercial-use license and any attribution.
4. Identify whether the file is a flattened reference or editable source.
5. Update the film manifest, notes and last-audited date.
6. Do not expose restricted raw footage, employee records, customer operational data or editable source credentials in public documentation.

[Return to video-production index](README.md).
