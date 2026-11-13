# Canonical documentation inventory and status register

Reviewed against canonical `main` at `9477ec0c0c103076935c4347978ac59e9207860c`, with this reconciliation applied. The register covers all tracked files under `docs/`, including evidence data and visuals, plus root and agent reference documents listed below. Core contracts received a source-level review. Historical packages and receipts were screened for their subject, provenance and suitability as guidance. This register records their role without relocating their files.

| Classification | Meaning |
| --- | --- |
| CURRENT | Authoritative or verified forward guidance for its stated scope |
| CURRENT WITH GAPS | Useful reference with remaining stale or incomplete implementation detail |
| APPROVED TARGET | Accepted future behavior with no claim of current implementation |
| HISTORICAL | Dated decisions, test evidence, snapshots or prior rollout material |
| SUPERSEDED | Instructions conflict with a newer accepted contract |
| ARCHIVE CANDIDATE | Retain for reference and exclude from normal implementation navigation |

Accepted targets are also embedded within current documents. The optional Role Job Flow composition and unified temporal projection described in [01B](product/01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md), and Marketplace distribution of Rhythm starters and Menu templates in the [Product contract](product/13_DEPARTMENT_PRODUCT.md), are **APPROVED TARGET** sections. Their parent files also carry current policy. Historical project plans and EVS proposals do not acquire approved status from this inventory.

## Replacements for superseded guidance

| Historical package or claim | Forward reference |
| --- | --- |
| Department Administration 01–07 and Location Program realignment. Overview/Locations/Teams and Team-owned cycle/need. | [Department Builder](product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md) |
| Profiles, archetypes, Operational Types, Location Functions, Experience frameworks and projection input models. | [Canonical place ownership](product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md#facility-and-participation) and the [engine source map](product/NEW_DEPARTMENT_PRODUCT_IMPLEMENTATION_GUIDE.md#3-reuse-the-owning-engines) |
| Generic Work Plans/presets and prior EVS and Dietary Work instructions. | [Workforce and domain ownership](product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md#people-teams-coverage-and-assignments) and [EVS release status](evs/README.md) |
| Legacy Logs, operational templates and earlier Records overlays. | [Records Catalog and applicability owners](../src/lib/canonical-logs/) |
| Business Workspace, Operations Center, Today's Work and Dashboard Work Plan card references. | [Dashboard contract](dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md) and [employee Job Flow](../src/lib/employee-runtime-flow/) |
| Early platform vision, rollout runbooks and historical certification dependencies. | [Product Constitution](product/README.md), [engineering workflow](engineering/LOCAL_DEVELOPMENT_AND_RELEASE.md) and [canonical baseline](architecture/PRELAUNCH_CANONICAL_BASELINE_2026-11-11.md) |

## Root and agent references

| File | Status |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | CURRENT |
| [Repository README](../README.md) | CURRENT WITH GAPS |
| [CLAUDE.md](../CLAUDE.md) | CURRENT |

| [README.md](../memory-bank/README.md) | HISTORICAL |
| [architecture-decisions.md](../memory-bank/architecture-decisions.md) | HISTORICAL |
| [employee-hr-source-of-truth.md](../memory-bank/employee-hr-source-of-truth.md) | HISTORICAL |
| [future-projects-ltc-ops-strategy.md](../memory-bank/future-projects-ltc-ops-strategy.md) | HISTORICAL |
| [implementation-phases.md](../memory-bank/implementation-phases.md) | HISTORICAL |
| [progress-log.md](../memory-bank/progress-log.md) | HISTORICAL |
| [project-overview.md](../memory-bank/project-overview.md) | HISTORICAL |
| [runbook.md](../memory-bank/runbook.md) | HISTORICAL |
| [session-notes.md](../memory-bank/session-notes.md) | HISTORICAL |

## Tracked documentation tree

**501 files**. 90 ARCHIVE CANDIDATE, 23 CURRENT, 14 CURRENT WITH GAPS, 266 HISTORICAL, 108 SUPERSEDED.

### administration (2)

| File | Status |
| --- | --- |
| [01_ADMINISTRATION_INFORMATION_ARCHITECTURE_AUDIT.md](administration/01_ADMINISTRATION_INFORMATION_ARCHITECTURE_AUDIT.md) | HISTORICAL |
| [02_ADMINISTRATION_IA_NAVIGATION_IMPLEMENTATION.md](administration/02_ADMINISTRATION_IA_NAVIGATION_IMPLEMENTATION.md) | HISTORICAL |

### architecture (59)

| File | Status |
| --- | --- |
| [ADR_PLATFORM_OWNED_ROUTE_AUTHORIZATION_2026-08-04.md](architecture/ADR_PLATFORM_OWNED_ROUTE_AUTHORIZATION_2026-08-04.md) | HISTORICAL |
| [LTC_MANAGER_BUILDABLE_BASELINE_2026-08-04.md](architecture/LTC_MANAGER_BUILDABLE_BASELINE_2026-08-04.md) | HISTORICAL |
| [PHASE_0_ARCHITECTURE_RECONCILIATION_REGISTER_2026-11-08.md](architecture/PHASE_0_ARCHITECTURE_RECONCILIATION_REGISTER_2026-11-08.md) | HISTORICAL |
| [PHASE_0_PLATFORM_ARCHITECTURE_ATLAS_2026-11-08.md](architecture/PHASE_0_PLATFORM_ARCHITECTURE_ATLAS_2026-11-08.md) | HISTORICAL |
| [PHASE_0_README.md](architecture/PHASE_0_README.md) | HISTORICAL |
| [PHASE_0_TEMPORAL_ARCHITECTURE_AUDIT_2026-11-08.md](architecture/PHASE_0_TEMPORAL_ARCHITECTURE_AUDIT_2026-11-08.md) | HISTORICAL |
| [PHASE_1_ARCHITECTURE_CONTRACTS_RECONCILIATION_2026-11-08.md](architecture/PHASE_1_ARCHITECTURE_CONTRACTS_RECONCILIATION_2026-11-08.md) | HISTORICAL |
| [PHASE_2A_LOCATION_FUNCTION_AUTHORING_CLOSED_2026-11-08.md](architecture/PHASE_2A_LOCATION_FUNCTION_AUTHORING_CLOSED_2026-11-08.md) | HISTORICAL |
| [PHASE_2B_GENERIC_WORK_AUTHORING_CLOSED_2026-11-08.md](architecture/PHASE_2B_GENERIC_WORK_AUTHORING_CLOSED_2026-11-08.md) | HISTORICAL |
| [PHASE_2C1_JOB_FLOW_CONSUMER_AUDIT_AND_REHOMING_DESIGN_2026-11-08.md](architecture/PHASE_2C1_JOB_FLOW_CONSUMER_AUDIT_AND_REHOMING_DESIGN_2026-11-08.md) | HISTORICAL |
| [PHASE_2C2A_JOB_FLOW_COMPOSITION_FOUNDATION.md](architecture/PHASE_2C2A_JOB_FLOW_COMPOSITION_FOUNDATION.md) | HISTORICAL |
| [PHASE_2C2B_CANONICAL_JOB_FLOW_CONTRIBUTORS.md](architecture/PHASE_2C2B_CANONICAL_JOB_FLOW_CONTRIBUTORS.md) | HISTORICAL |
| [PHASE_2C2C_UNIFIED_EMPLOYEE_JOB_FLOW_PRESENTATION.md](architecture/PHASE_2C2C_UNIFIED_EMPLOYEE_JOB_FLOW_PRESENTATION.md) | HISTORICAL |
| [PHASE_2C2D_OFFLINE_JOB_FLOW_COMPATIBILITY.md](architecture/PHASE_2C2D_OFFLINE_JOB_FLOW_COMPATIBILITY.md) | HISTORICAL |
| [PHASE_2C2E_GENERIC_WORK_SOURCE_SEPARATION.md](architecture/PHASE_2C2E_GENERIC_WORK_SOURCE_SEPARATION.md) | HISTORICAL |
| [PHASE_2C2F_WORK_CUTOVER_READINESS.md](architecture/PHASE_2C2F_WORK_CUTOVER_READINESS.md) | HISTORICAL |
| [PHASE_2C2G1_DATABASE_INTEGRITY_AND_CUTOVER_GATE.md](architecture/PHASE_2C2G1_DATABASE_INTEGRITY_AND_CUTOVER_GATE.md) | HISTORICAL |
| [PHASE_2C2G2_EMPLOYEE_WORK_CUTOVER.md](architecture/PHASE_2C2G2_EMPLOYEE_WORK_CUTOVER.md) | HISTORICAL |
| [PHASE_2C2H1_DASHBOARD_SUPERVISOR_WORK_RECONCILIATION.md](architecture/PHASE_2C2H1_DASHBOARD_SUPERVISOR_WORK_RECONCILIATION.md) | HISTORICAL |
| [PHASE_2C2H2_OFFLINE_WORK_PRESENTATION_RECONCILIATION.md](architecture/PHASE_2C2H2_OFFLINE_WORK_PRESENTATION_RECONCILIATION.md) | HISTORICAL |
| [PHASE_2C2H3_FINAL_ACTIVE_WORK_CONSUMER_RECONCILIATION.md](architecture/PHASE_2C2H3_FINAL_ACTIVE_WORK_CONSUMER_RECONCILIATION.md) | HISTORICAL |
| [PHASE_2C_FINAL_INTEGRATION_CERTIFICATION.md](architecture/PHASE_2C_FINAL_INTEGRATION_CERTIFICATION.md) | HISTORICAL |
| [PHASE_2C_PRODUCTION_DEPLOYMENT_REPORT.md](architecture/PHASE_2C_PRODUCTION_DEPLOYMENT_REPORT.md) | HISTORICAL |
| [PHASE_2C_RELEASE_R1_CDA_MANIFEST_CORRECTION.md](architecture/PHASE_2C_RELEASE_R1_CDA_MANIFEST_CORRECTION.md) | HISTORICAL |
| [PHASE_2C_RELEASE_R2_EXECUTION_VALIDATION.md](architecture/PHASE_2C_RELEASE_R2_EXECUTION_VALIDATION.md) | HISTORICAL |
| [PHASE_2C_RELEASE_R3_OFFLINE_FIXTURE_AND_BROWSER_CERTIFICATION.md](architecture/PHASE_2C_RELEASE_R3_OFFLINE_FIXTURE_AND_BROWSER_CERTIFICATION.md) | HISTORICAL |
| [PHASE_2C_RELEASE_R4_FINAL_DEPLOYMENT_GATE.md](architecture/PHASE_2C_RELEASE_R4_FINAL_DEPLOYMENT_GATE.md) | HISTORICAL |
| [PHASE_2D1_LOCATION_CLASSIFICATION_DEPENDENCY_AUDIT.md](architecture/PHASE_2D1_LOCATION_CLASSIFICATION_DEPENDENCY_AUDIT.md) | HISTORICAL |
| [PHASE_2D2_CANONICAL_ROOM_DEPARTMENT_CONFIGURATION_CONTRACT.md](architecture/PHASE_2D2_CANONICAL_ROOM_DEPARTMENT_CONFIGURATION_CONTRACT.md) | HISTORICAL |
| [PHASE_2D3_FACILITY_DEPARTMENT_ROOM_FOUNDATION.md](architecture/PHASE_2D3_FACILITY_DEPARTMENT_ROOM_FOUNDATION.md) | HISTORICAL |
| [PHASE_2D4_CANONICAL_OPERATIONAL_READER_RECONCILIATION.md](architecture/PHASE_2D4_CANONICAL_OPERATIONAL_READER_RECONCILIATION.md) | HISTORICAL |
| [PHASE_2D5_COVERAGE_TEAMS_LEGACY_READER_RECONCILIATION.md](architecture/PHASE_2D5_COVERAGE_TEAMS_LEGACY_READER_RECONCILIATION.md) | HISTORICAL |
| [PHASE_2D6_INTEGRATED_CERTIFICATION_AND_DEPLOYMENT_GATE.md](architecture/PHASE_2D6_INTEGRATED_CERTIFICATION_AND_DEPLOYMENT_GATE.md) | HISTORICAL |
| [PHASE_2D_FINAL_RELEASE_PREFLIGHT.md](architecture/PHASE_2D_FINAL_RELEASE_PREFLIGHT.md) | HISTORICAL |
| [PHASE_2D_PRODUCTION_DEPLOYMENT_REPORT.md](architecture/PHASE_2D_PRODUCTION_DEPLOYMENT_REPORT.md) | HISTORICAL |
| [PHASE_2D_RELEASE_BLOCKER_PF_2D_002.md](architecture/PHASE_2D_RELEASE_BLOCKER_PF_2D_002.md) | HISTORICAL |
| [PHASE_2D_RELEASE_REMEDIATION_PF_2D_001.md](architecture/PHASE_2D_RELEASE_REMEDIATION_PF_2D_001.md) | HISTORICAL |
| [PRELAUNCH_ASSIGNMENT_LIFECYCLE_PROGRESS_2026-11-10.md](architecture/PRELAUNCH_ASSIGNMENT_LIFECYCLE_PROGRESS_2026-11-10.md) | HISTORICAL |
| [PRELAUNCH_CANONICAL_BASELINE_2026-11-11.md](architecture/PRELAUNCH_CANONICAL_BASELINE_2026-11-11.md) | CURRENT WITH GAPS |
| [PRELAUNCH_CANONICAL_CONSOLIDATION_EXECUTION_REPORT_2026-11-10.md](architecture/PRELAUNCH_CANONICAL_CONSOLIDATION_EXECUTION_REPORT_2026-11-10.md) | HISTORICAL |
| [PRELAUNCH_CANONICAL_CUTOVER_GATE.md](architecture/PRELAUNCH_CANONICAL_CUTOVER_GATE.md) | HISTORICAL |
| [PRELAUNCH_WORKFORCE_PROGRESS_2026-11-10.md](architecture/PRELAUNCH_WORKFORCE_PROGRESS_2026-11-10.md) | HISTORICAL |
| [PRELAUNCH_WORK_RETIREMENT_PROGRESS_2026-11-10.md](architecture/PRELAUNCH_WORK_RETIREMENT_PROGRESS_2026-11-10.md) | HISTORICAL |
| [SUPPORT_TICKETS.md](architecture/SUPPORT_TICKETS.md) | CURRENT WITH GAPS |
| [archive/prelaunch-2026-11-10/AGENTS.md.before-prelaunch](architecture/archive/prelaunch-2026-11-10/AGENTS.md.before-prelaunch) | ARCHIVE CANDIDATE |
| [archive/prelaunch-2026-11-10/ARR.before-prelaunch.md](architecture/archive/prelaunch-2026-11-10/ARR.before-prelaunch.md) | ARCHIVE CANDIDATE |
| [archive/prelaunch-2026-11-10/certification/README.md](architecture/archive/prelaunch-2026-11-10/certification/README.md) | ARCHIVE CANDIDATE |
| [archive/prelaunch-2026-11-10/certification/n5dh-provision.ts.txt](architecture/archive/prelaunch-2026-11-10/certification/n5dh-provision.ts.txt) | ARCHIVE CANDIDATE |
| [archive/prelaunch-2026-11-10/migrations/20261108120000_people_coverage_explicit_space_and_org_teams/migration.sql](architecture/archive/prelaunch-2026-11-10/migrations/20261108120000_people_coverage_explicit_space_and_org_teams/migration.sql) | ARCHIVE CANDIDATE |
| [archive/prelaunch-2026-11-10/migrations/README.md](architecture/archive/prelaunch-2026-11-10/migrations/README.md) | ARCHIVE CANDIDATE |
| [archive/prelaunch-2026-11-10/r4-evidence/scripts/verify/r4-auth-checks.ts.txt](architecture/archive/prelaunch-2026-11-10/r4-evidence/scripts/verify/r4-auth-checks.ts.txt) | ARCHIVE CANDIDATE |
| [archive/prelaunch-2026-11-10/r4-evidence/scripts/verify/run-r4-release-browser.mjs.txt](architecture/archive/prelaunch-2026-11-10/r4-evidence/scripts/verify/run-r4-release-browser.mjs.txt) | ARCHIVE CANDIDATE |
| [archive/prelaunch-2026-11-10/r4-evidence/tests/playwright.r4-release.config.ts.txt](architecture/archive/prelaunch-2026-11-10/r4-evidence/tests/playwright.r4-release.config.ts.txt) | ARCHIVE CANDIDATE |
| [archive/prelaunch-2026-11-10/r4-evidence/tests/r4-release-browser/ci-gate.spec.ts.txt](architecture/archive/prelaunch-2026-11-10/r4-evidence/tests/r4-release-browser/ci-gate.spec.ts.txt) | ARCHIVE CANDIDATE |
| [archive/prelaunch-2026-11-10/vssyl-foundation.mdc.before-prelaunch](architecture/archive/prelaunch-2026-11-10/vssyl-foundation.mdc.before-prelaunch) | ARCHIVE CANDIDATE |
| [prelaunch-assignment-lifecycle-evidence.json](architecture/prelaunch-assignment-lifecycle-evidence.json) | HISTORICAL |
| [prelaunch-consolidation-evidence.json](architecture/prelaunch-consolidation-evidence.json) | HISTORICAL |
| [prelaunch-retirement-reference-inventory.json](architecture/prelaunch-retirement-reference-inventory.json) | HISTORICAL |
| [prelaunch-workforce-evidence.json](architecture/prelaunch-workforce-evidence.json) | HISTORICAL |

### architecture-review (10)

| File | Status |
| --- | --- |
| [01-technology-stack.md](architecture-review/01-technology-stack.md) | ARCHIVE CANDIDATE |
| [02-repository-structure.md](architecture-review/02-repository-structure.md) | ARCHIVE CANDIDATE |
| [03-database-assessment.md](architecture-review/03-database-assessment.md) | ARCHIVE CANDIDATE |
| [04-existing-features.md](architecture-review/04-existing-features.md) | ARCHIVE CANDIDATE |
| [05-ui-assessment.md](architecture-review/05-ui-assessment.md) | ARCHIVE CANDIDATE |
| [06-domain-assessment.md](architecture-review/06-domain-assessment.md) | ARCHIVE CANDIDATE |
| [07-architecture-assessment.md](architecture-review/07-architecture-assessment.md) | ARCHIVE CANDIDATE |
| [08-product-assessment.md](architecture-review/08-product-assessment.md) | ARCHIVE CANDIDATE |
| [PHASE_7D_SCHEMA_DIFF_CLASSIFICATION.md](architecture-review/PHASE_7D_SCHEMA_DIFF_CLASSIFICATION.md) | ARCHIVE CANDIDATE |
| [README.md](architecture-review/README.md) | ARCHIVE CANDIDATE |

### assets (5)

| File | Status |
| --- | --- |
| [DIETARY_ASSET_ISSUE_REPORTING_GUIDE.md](assets/DIETARY_ASSET_ISSUE_REPORTING_GUIDE.md) | HISTORICAL |
| [DIETARY_ASSET_MANAGER_GUIDE.md](assets/DIETARY_ASSET_MANAGER_GUIDE.md) | HISTORICAL |
| [DIETARY_ASSET_OPERATIONS_PHASE_10A_2026-08-06.md](assets/DIETARY_ASSET_OPERATIONS_PHASE_10A_2026-08-06.md) | HISTORICAL |
| [DIETARY_ASSET_OPERATIONS_PHASE_10A_OWNERSHIP_2026-08-06.md](assets/DIETARY_ASSET_OPERATIONS_PHASE_10A_OWNERSHIP_2026-08-06.md) | HISTORICAL |
| [DIETARY_WORK_ORDER_GUIDE.md](assets/DIETARY_WORK_ORDER_GUIDE.md) | HISTORICAL |

### console (7)

| File | Status |
| --- | --- |
| [ASSISTED_FACILITY_PROVISIONING_2026-10-11.md](console/ASSISTED_FACILITY_PROVISIONING_2026-10-11.md) | HISTORICAL |
| [CONSOLE_BILLING_DIAGNOSTICS_CERTIFICATION_2026-10-07.md](console/CONSOLE_BILLING_DIAGNOSTICS_CERTIFICATION_2026-10-07.md) | HISTORICAL |
| [CONSOLE_BILLING_OPERATIONS_PHASE_PLAN_2026-10-07.md](console/CONSOLE_BILLING_OPERATIONS_PHASE_PLAN_2026-10-07.md) | HISTORICAL |
| [CONSOLE_MARKETPLACE_PHASE_6B_CERTIFICATION_2026-10-07.md](console/CONSOLE_MARKETPLACE_PHASE_6B_CERTIFICATION_2026-10-07.md) | HISTORICAL |
| [CONSOLE_MARKETPLACE_PHASE_6C_CERTIFICATION_2026-10-07.md](console/CONSOLE_MARKETPLACE_PHASE_6C_CERTIFICATION_2026-10-07.md) | HISTORICAL |
| [CONSOLE_MARKETPLACE_PHASE_6D_CERTIFICATION_2026-10-07.md](console/CONSOLE_MARKETPLACE_PHASE_6D_CERTIFICATION_2026-10-07.md) | HISTORICAL |
| [CONSOLE_MARKETPLACE_V1_CERTIFICATION_2026-10-07.md](console/CONSOLE_MARKETPLACE_V1_CERTIFICATION_2026-10-07.md) | HISTORICAL |

### contracted-departments (7)

| File | Status |
| --- | --- |
| [ARCHITECTURE.md](contracted-departments/ARCHITECTURE.md) | CURRENT WITH GAPS |
| [CDA-06_DESIGN.md](contracted-departments/CDA-06_DESIGN.md) | HISTORICAL |
| [CURRENT_STATE_AUDIT_2026-10-20.md](contracted-departments/CURRENT_STATE_AUDIT_2026-10-20.md) | HISTORICAL |
| [DECISIONS.md](contracted-departments/DECISIONS.md) | CURRENT |
| [PHASED_PLAN.md](contracted-departments/PHASED_PLAN.md) | HISTORICAL |
| [PHASE_TRACKER.md](contracted-departments/PHASE_TRACKER.md) | HISTORICAL |
| [README.md](contracted-departments/README.md) | CURRENT WITH GAPS |

### dashboard (8)

| File | Status |
| --- | --- |
| [ARCHITECTURE.md](dashboard/ARCHITECTURE.md) | SUPERSEDED |
| [CARD_CATALOG.md](dashboard/CARD_CATALOG.md) | SUPERSEDED |
| [CURRENT_STATE_AUDIT_2026-10-20.md](dashboard/CURRENT_STATE_AUDIT_2026-10-20.md) | HISTORICAL |
| [DECISIONS.md](dashboard/DECISIONS.md) | HISTORICAL |
| [DEPARTMENT_DASHBOARD_CONTRACT.md](dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md) | CURRENT |
| [PHASED_PLAN.md](dashboard/PHASED_PLAN.md) | HISTORICAL |
| [PHASE_TRACKER.md](dashboard/PHASE_TRACKER.md) | HISTORICAL |
| [README.md](dashboard/README.md) | HISTORICAL |

### department-administration (38)

| File | Status |
| --- | --- |
| [00_INDEX.md](department-administration/00_INDEX.md) | CURRENT |
| [01_DEPARTMENT_ADMINISTRATION_CONSTITUTION.md](department-administration/01_DEPARTMENT_ADMINISTRATION_CONSTITUTION.md) | SUPERSEDED |
| [02_OPERATIONAL_AREA_MODEL.md](department-administration/02_OPERATIONAL_AREA_MODEL.md) | SUPERSEDED |
| [03_EXPERIENCE_CATALOG_ARCHITECTURE.md](department-administration/03_EXPERIENCE_CATALOG_ARCHITECTURE.md) | SUPERSEDED |
| [04_ROOM_ARCHETYPE_MODEL.md](department-administration/04_ROOM_ARCHETYPE_MODEL.md) | SUPERSEDED |
| [05_DEPARTMENT_CONFIGURATION_MODEL.md](department-administration/05_DEPARTMENT_CONFIGURATION_MODEL.md) | SUPERSEDED |
| [06_PLATFORM_EXPANSION_MODEL.md](department-administration/06_PLATFORM_EXPANSION_MODEL.md) | SUPERSEDED |
| [07_ADMIN_INFORMATION_ARCHITECTURE.md](department-administration/07_ADMIN_INFORMATION_ARCHITECTURE.md) | SUPERSEDED |
| [08_PROJECTION_RECERTIFICATION.md](department-administration/08_PROJECTION_RECERTIFICATION.md) | HISTORICAL |
| [09_IMPLEMENTATION_ROADMAP.md](department-administration/09_IMPLEMENTATION_ROADMAP.md) | HISTORICAL |
| [10_CERTIFICATION.md](department-administration/10_CERTIFICATION.md) | HISTORICAL |
| [11_WAVE_14B_IMPLEMENTATION.md](department-administration/11_WAVE_14B_IMPLEMENTATION.md) | HISTORICAL |
| [12_WAVE_14C_IMPLEMENTATION.md](department-administration/12_WAVE_14C_IMPLEMENTATION.md) | HISTORICAL |
| [13_LOCATION_PROGRAMMING_REALIGNMENT.md](department-administration/13_LOCATION_PROGRAMMING_REALIGNMENT.md) | SUPERSEDED |
| [14_DEPARTMENT_BUILDER_FACILITY_AUDIT_2026-11-01.md](department-administration/14_DEPARTMENT_BUILDER_FACILITY_AUDIT_2026-11-01.md) | HISTORICAL |
| [14_RUN_SURFACE_REFERENCE_FREEZE.md](department-administration/14_RUN_SURFACE_REFERENCE_FREEZE.md) | HISTORICAL |
| [visual-audit/01_CURRENT_DEPARTMENT_BUILDER.md](department-administration/visual-audit/01_CURRENT_DEPARTMENT_BUILDER.md) | HISTORICAL |
| [visual-audit/02_TARGET_DEPARTMENT_BUILDER.md](department-administration/visual-audit/02_TARGET_DEPARTMENT_BUILDER.md) | HISTORICAL |
| [visual-audit/03_FACILITY_OWNERSHIP_MAP.md](department-administration/visual-audit/03_FACILITY_OWNERSHIP_MAP.md) | HISTORICAL |
| [visual-audit/04_LOCATION_FUNCTION_CURRENT_VS_TARGET.md](department-administration/visual-audit/04_LOCATION_FUNCTION_CURRENT_VS_TARGET.md) | HISTORICAL |
| [visual-audit/05_PEOPLE_COVERAGE_MODEL.md](department-administration/visual-audit/05_PEOPLE_COVERAGE_MODEL.md) | HISTORICAL |
| [visual-audit/06_FACILITY_UI_CONCEPT.md](department-administration/visual-audit/06_FACILITY_UI_CONCEPT.md) | HISTORICAL |
| [visual-audit/06_facility_ui_concept.html](department-administration/visual-audit/06_facility_ui_concept.html) | HISTORICAL |
| [visual-audit/07_WHAT_WE_ARE_REMOVING.md](department-administration/visual-audit/07_WHAT_WE_ARE_REMOVING.md) | HISTORICAL |
| [visual-audit/08_LOCATION_FUNCTION_ELIMINATION_AUDIT.md](department-administration/visual-audit/08_LOCATION_FUNCTION_ELIMINATION_AUDIT.md) | HISTORICAL |
| [visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/01_current_screen.html](department-administration/visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/01_current_screen.html) | HISTORICAL |
| [visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/01_current_screen.md](department-administration/visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/01_current_screen.md) | HISTORICAL |
| [visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/02_data_ownership.md](department-administration/visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/02_data_ownership.md) | HISTORICAL |
| [visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/03_proposed_layout.html](department-administration/visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/03_proposed_layout.html) | HISTORICAL |
| [visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/03_proposed_layout.md](department-administration/visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/03_proposed_layout.md) | HISTORICAL |
| [visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/04_manager_workflow.md](department-administration/visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/04_manager_workflow.md) | HISTORICAL |
| [visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/05_employee_workflow.md](department-administration/visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/05_employee_workflow.md) | HISTORICAL |
| [visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/06_coverage_lifecycle.md](department-administration/visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/06_coverage_lifecycle.md) | HISTORICAL |
| [visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/PHASE_9C_CERTIFICATION.md](department-administration/visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/PHASE_9C_CERTIFICATION.md) | HISTORICAL |
| [visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/PHASE_9D_CERTIFICATION.md](department-administration/visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/PHASE_9D_CERTIFICATION.md) | HISTORICAL |
| [visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/PHASE_9E_CERTIFICATION.md](department-administration/visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/PHASE_9E_CERTIFICATION.md) | HISTORICAL |
| [visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/README.md](department-administration/visual-audit/09_PEOPLE_COVERAGE_COMPOSITION/README.md) | HISTORICAL |
| [visual-audit/README.md](department-administration/visual-audit/README.md) | HISTORICAL |

### department-operational-profiles (11)

| File | Status |
| --- | --- |
| [00_INDEX.md](department-operational-profiles/00_INDEX.md) | SUPERSEDED |
| [01_PROBLEM_STATEMENT.md](department-operational-profiles/01_PROBLEM_STATEMENT.md) | SUPERSEDED |
| [02_OPERATIONAL_PROFILE_MODEL.md](department-operational-profiles/02_OPERATIONAL_PROFILE_MODEL.md) | SUPERSEDED |
| [03_EXPERIENCE_MODEL.md](department-operational-profiles/03_EXPERIENCE_MODEL.md) | SUPERSEDED |
| [04_CAPABILITY_MODEL.md](department-operational-profiles/04_CAPABILITY_MODEL.md) | SUPERSEDED |
| [05_DEPARTMENT_CONFIGURATION.md](department-operational-profiles/05_DEPARTMENT_CONFIGURATION.md) | SUPERSEDED |
| [06_ROOM_TYPE_STRATEGY.md](department-operational-profiles/06_ROOM_TYPE_STRATEGY.md) | SUPERSEDED |
| [07_ADMIN_EXPERIENCE.md](department-operational-profiles/07_ADMIN_EXPERIENCE.md) | SUPERSEDED |
| [08_PROJECTION_IMPACT.md](department-operational-profiles/08_PROJECTION_IMPACT.md) | SUPERSEDED |
| [09_MIGRATION_PLAN.md](department-operational-profiles/09_MIGRATION_PLAN.md) | SUPERSEDED |
| [10_CERTIFICATION.md](department-operational-profiles/10_CERTIFICATION.md) | SUPERSEDED |

### deployment (8)

| File | Status |
| --- | --- |
| [DIETARY_V1_BACKUP_RESTORE_RUNBOOK.md](deployment/DIETARY_V1_BACKUP_RESTORE_RUNBOOK.md) | ARCHIVE CANDIDATE |
| [DIETARY_V1_DEPLOYMENT_RUNBOOK.md](deployment/DIETARY_V1_DEPLOYMENT_RUNBOOK.md) | ARCHIVE CANDIDATE |
| [DIETARY_V1_DEVICE_READINESS_CHECKLIST.md](deployment/DIETARY_V1_DEVICE_READINESS_CHECKLIST.md) | ARCHIVE CANDIDATE |
| [DIETARY_V1_ENVIRONMENT_VARIABLES.md](deployment/DIETARY_V1_ENVIRONMENT_VARIABLES.md) | ARCHIVE CANDIDATE |
| [DIETARY_V1_PILOT_ENVIRONMENT_DECISION_2026-08-05.md](deployment/DIETARY_V1_PILOT_ENVIRONMENT_DECISION_2026-08-05.md) | ARCHIVE CANDIDATE |
| [DIETARY_V1_PILOT_ROLLOUT_PLAN.md](deployment/DIETARY_V1_PILOT_ROLLOUT_PLAN.md) | ARCHIVE CANDIDATE |
| [DIETARY_V1_PROVIDER_SELECTION_PHASE_8B_2026-08-05.md](deployment/DIETARY_V1_PROVIDER_SELECTION_PHASE_8B_2026-08-05.md) | ARCHIVE CANDIDATE |
| [DIETARY_V1_STAGE0_STAGING_EVIDENCE_2026-08-05.md](deployment/DIETARY_V1_STAGE0_STAGING_EVIDENCE_2026-08-05.md) | ARCHIVE CANDIDATE |

### employee-builder (9)

| File | Status |
| --- | --- |
| [OPERATIONAL_ELIGIBILITY.md](employee-builder/OPERATIONAL_ELIGIBILITY.md) | CURRENT |
| [README.md](employee-builder/README.md) | CURRENT |
| [ROLE_ARCHITECTURE_AUDIT_2026-11-04.md](employee-builder/ROLE_ARCHITECTURE_AUDIT_2026-11-04.md) | HISTORICAL |
| [visuals/01-current-workforce.md](employee-builder/visuals/01-current-workforce.md) | HISTORICAL |
| [visuals/02-proposed-organization.md](employee-builder/visuals/02-proposed-organization.md) | HISTORICAL |
| [visuals/03-identity-eligibility-assignment.md](employee-builder/visuals/03-identity-eligibility-assignment.md) | HISTORICAL |
| [visuals/04-management-and-authorization.md](employee-builder/visuals/04-management-and-authorization.md) | HISTORICAL |
| [visuals/05-coverage-and-assignment.md](employee-builder/visuals/05-coverage-and-assignment.md) | HISTORICAL |
| [visuals/06-employee-builder-wireframe.html](employee-builder/visuals/06-employee-builder-wireframe.html) | HISTORICAL |

### engineering (7)

| File | Status |
| --- | --- |
| [CONTINUOUS_VERIFICATION_PHASE_5_2026-08-05.md](engineering/CONTINUOUS_VERIFICATION_PHASE_5_2026-08-05.md) | HISTORICAL |
| [CONTINUOUS_VERIFICATION_PHASE_5_REMEDIATION_2026-08-05.md](engineering/CONTINUOUS_VERIFICATION_PHASE_5_REMEDIATION_2026-08-05.md) | HISTORICAL |
| [LOCAL_DEVELOPMENT_AND_RELEASE.md](engineering/LOCAL_DEVELOPMENT_AND_RELEASE.md) | CURRENT |
| [MIGRATION_HISTORY_EXCEPTIONS.md](engineering/MIGRATION_HISTORY_EXCEPTIONS.md) | HISTORICAL |
| [OFFLINE_RUNTIME_FOUNDATION_PHASE_6A_2026-08-05.md](engineering/OFFLINE_RUNTIME_FOUNDATION_PHASE_6A_2026-08-05.md) | HISTORICAL |
| [OFFLINE_RUNTIME_PHASE_6A_BROWSER_CERTIFICATION_2026-08-05.md](engineering/OFFLINE_RUNTIME_PHASE_6A_BROWSER_CERTIFICATION_2026-08-05.md) | HISTORICAL |
| [OFFLINE_RUNTIME_RECOVERY_NOTE.md](engineering/OFFLINE_RUNTIME_RECOVERY_NOTE.md) | HISTORICAL |

### evs (8)

| File | Status |
| --- | --- |
| [EVS_ASSIGNMENT_ZONES_SCALE_PHASE_11C_2026-08-07.md](evs/EVS_ASSIGNMENT_ZONES_SCALE_PHASE_11C_2026-08-07.md) | HISTORICAL |
| [EVS_EMPLOYEE_GUIDE.md](evs/EVS_EMPLOYEE_GUIDE.md) | SUPERSEDED |
| [EVS_MANAGER_SETUP_GUIDE.md](evs/EVS_MANAGER_SETUP_GUIDE.md) | SUPERSEDED |
| [EVS_PHASE_11B_OWNERSHIP_DECISION_2026-08-07.md](evs/EVS_PHASE_11B_OWNERSHIP_DECISION_2026-08-07.md) | HISTORICAL |
| [EVS_PHASE_11C_OWNERSHIP_DECISION_2026-08-07.md](evs/EVS_PHASE_11C_OWNERSHIP_DECISION_2026-08-07.md) | HISTORICAL |
| [EVS_REFERENCE_IMPLEMENTATION_PHASE_11B_2026-08-07.md](evs/EVS_REFERENCE_IMPLEMENTATION_PHASE_11B_2026-08-07.md) | HISTORICAL |
| [EVS_SUPERVISOR_GUIDE.md](evs/EVS_SUPERVISOR_GUIDE.md) | SUPERSEDED |
| [README.md](evs/README.md) | CURRENT |

### experience-framework (17)

| File | Status |
| --- | --- |
| [00_EXPERIENCE_FRAMEWORK_INDEX.md](experience-framework/00_EXPERIENCE_FRAMEWORK_INDEX.md) | SUPERSEDED |
| [01_EXPERIENCE_COMPOSITION_MODEL.md](experience-framework/01_EXPERIENCE_COMPOSITION_MODEL.md) | SUPERSEDED |
| [02_SECTION_MODEL.md](experience-framework/02_SECTION_MODEL.md) | SUPERSEDED |
| [03_CARD_MODEL.md](experience-framework/03_CARD_MODEL.md) | SUPERSEDED |
| [04_WIDGET_MODEL.md](experience-framework/04_WIDGET_MODEL.md) | SUPERSEDED |
| [05_ACTION_MODEL.md](experience-framework/05_ACTION_MODEL.md) | SUPERSEDED |
| [06_TOOL_HOSTING_MODEL.md](experience-framework/06_TOOL_HOSTING_MODEL.md) | SUPERSEDED |
| [07_LAYOUT_CONTRACTS.md](experience-framework/07_LAYOUT_CONTRACTS.md) | SUPERSEDED |
| [08_COMPONENT_REGISTRY.md](experience-framework/08_COMPONENT_REGISTRY.md) | SUPERSEDED |
| [09_RENDERING_PIPELINE.md](experience-framework/09_RENDERING_PIPELINE.md) | SUPERSEDED |
| [10_HOME_ADAPTATION_MODEL.md](experience-framework/10_HOME_ADAPTATION_MODEL.md) | SUPERSEDED |
| [11_RUNTIME_OVERLAY_MODEL.md](experience-framework/11_RUNTIME_OVERLAY_MODEL.md) | SUPERSEDED |
| [12_EXTENSION_MODEL.md](experience-framework/12_EXTENSION_MODEL.md) | SUPERSEDED |
| [13_DESIGN_LANGUAGE.md](experience-framework/13_DESIGN_LANGUAGE.md) | SUPERSEDED |
| [14_MIGRATION_MODEL.md](experience-framework/14_MIGRATION_MODEL.md) | SUPERSEDED |
| [15_IMPLEMENTATION_PLAN.md](experience-framework/15_IMPLEMENTATION_PLAN.md) | SUPERSEDED |
| [16_CERTIFICATION.md](experience-framework/16_CERTIFICATION.md) | SUPERSEDED |

### experience-runtime (18)

| File | Status |
| --- | --- |
| [00_EXPERIENCE_RUNTIME_INDEX.md](experience-runtime/00_EXPERIENCE_RUNTIME_INDEX.md) | SUPERSEDED |
| [01_EXPERIENCE_CONSTITUTION.md](experience-runtime/01_EXPERIENCE_CONSTITUTION.md) | SUPERSEDED |
| [02_EXPERIENCE_DEFINITION.md](experience-runtime/02_EXPERIENCE_DEFINITION.md) | SUPERSEDED |
| [03_EXPERIENCE_ANATOMY.md](experience-runtime/03_EXPERIENCE_ANATOMY.md) | SUPERSEDED |
| [04_EXPERIENCE_CONTRACTS.md](experience-runtime/04_EXPERIENCE_CONTRACTS.md) | SUPERSEDED |
| [05_EXPERIENCE_COMPOSITION.md](experience-runtime/05_EXPERIENCE_COMPOSITION.md) | SUPERSEDED |
| [06_EXPERIENCE_TOOLS_MODEL.md](experience-runtime/06_EXPERIENCE_TOOLS_MODEL.md) | SUPERSEDED |
| [07_EXPERIENCE_AI_MODEL.md](experience-runtime/07_EXPERIENCE_AI_MODEL.md) | SUPERSEDED |
| [08_EXPERIENCE_ANALYTICS_MODEL.md](experience-runtime/08_EXPERIENCE_ANALYTICS_MODEL.md) | SUPERSEDED |
| [09_EXPERIENCE_PERMISSION_MODEL.md](experience-runtime/09_EXPERIENCE_PERMISSION_MODEL.md) | SUPERSEDED |
| [10_EXPERIENCE_ENGINE_BOUNDARY.md](experience-runtime/10_EXPERIENCE_ENGINE_BOUNDARY.md) | SUPERSEDED |
| [11_EXPERIENCE_PROJECTION_RELATIONSHIP.md](experience-runtime/11_EXPERIENCE_PROJECTION_RELATIONSHIP.md) | SUPERSEDED |
| [12_EXPERIENCE_WORKSPACE_RELATIONSHIP.md](experience-runtime/12_EXPERIENCE_WORKSPACE_RELATIONSHIP.md) | SUPERSEDED |
| [13_EXPERIENCE_EXPANSION_MODEL.md](experience-runtime/13_EXPERIENCE_EXPANSION_MODEL.md) | SUPERSEDED |
| [14_MIGRATION_MODEL.md](experience-runtime/14_MIGRATION_MODEL.md) | SUPERSEDED |
| [15_IMPLEMENTATION_RECOMMENDATIONS.md](experience-runtime/15_IMPLEMENTATION_RECOMMENDATIONS.md) | SUPERSEDED |
| [16_CERTIFICATION.md](experience-runtime/16_CERTIFICATION.md) | SUPERSEDED |
| [17_WAVE_16A_EXPERIENCE_SHELL.md](experience-runtime/17_WAVE_16A_EXPERIENCE_SHELL.md) | SUPERSEDED |

### implementation (9)

| File | Status |
| --- | --- |
| [00_IMPLEMENTATION_INDEX.md](implementation/00_IMPLEMENTATION_INDEX.md) | ARCHIVE CANDIDATE |
| [01_MODERNIZATION_ROADMAP.md](implementation/01_MODERNIZATION_ROADMAP.md) | ARCHIVE CANDIDATE |
| [02_CODEBASE_MAPPING.md](implementation/02_CODEBASE_MAPPING.md) | ARCHIVE CANDIDATE |
| [03_REGRESSION_PROTECTION.md](implementation/03_REGRESSION_PROTECTION.md) | ARCHIVE CANDIDATE |
| [04_RELEASE_STRATEGY.md](implementation/04_RELEASE_STRATEGY.md) | ARCHIVE CANDIDATE |
| [05_DEVELOPMENT_STANDARDS.md](implementation/05_DEVELOPMENT_STANDARDS.md) | ARCHIVE CANDIDATE |
| [06_WAVE_EXECUTION_TEMPLATE.md](implementation/06_WAVE_EXECUTION_TEMPLATE.md) | ARCHIVE CANDIDATE |
| [07_PROJECT_STATUS.md](implementation/07_PROJECT_STATUS.md) | ARCHIVE CANDIDATE |
| [08_MODERNIZATION_AUDIT.md](implementation/08_MODERNIZATION_AUDIT.md) | ARCHIVE CANDIDATE |

### launch (2)

| File | Status |
| --- | --- |
| [FIRST_CUSTOMER_PRODUCTION_CHECKLIST.md](launch/FIRST_CUSTOMER_PRODUCTION_CHECKLIST.md) | CURRENT WITH GAPS |
| [FIRST_PAYING_CUSTOMER_RUNBOOK.md](launch/FIRST_PAYING_CUSTOMER_RUNBOOK.md) | CURRENT WITH GAPS |

### legacy-retirement (6)

| File | Status |
| --- | --- |
| [CURRENT_STATE_AUDIT_2026-10-20.md](legacy-retirement/CURRENT_STATE_AUDIT_2026-10-20.md) | HISTORICAL |
| [DECISIONS.md](legacy-retirement/DECISIONS.md) | HISTORICAL |
| [DEPARTMENT_WORK_RETIREMENT_2026-11-01.md](legacy-retirement/DEPARTMENT_WORK_RETIREMENT_2026-11-01.md) | HISTORICAL |
| [PHASED_PLAN.md](legacy-retirement/PHASED_PLAN.md) | HISTORICAL |
| [PHASE_TRACKER.md](legacy-retirement/PHASE_TRACKER.md) | HISTORICAL |
| [README.md](legacy-retirement/README.md) | HISTORICAL |

### location-architecture (11)

| File | Status |
| --- | --- |
| [00_LOCATION_ARCHITECTURE_INDEX.md](location-architecture/00_LOCATION_ARCHITECTURE_INDEX.md) | HISTORICAL |
| [01_CURRENT_UNIT_MODEL_AUDIT.md](location-architecture/01_CURRENT_UNIT_MODEL_AUDIT.md) | HISTORICAL |
| [02_LOCATION_HIERARCHY_OPTIONS.md](location-architecture/02_LOCATION_HIERARCHY_OPTIONS.md) | HISTORICAL |
| [03_RECOMMENDED_LOCATION_MODEL.md](location-architecture/03_RECOMMENDED_LOCATION_MODEL.md) | HISTORICAL |
| [04_DEPARTMENT_RESPONSIBILITY_MODEL.md](location-architecture/04_DEPARTMENT_RESPONSIBILITY_MODEL.md) | HISTORICAL |
| [05_RESPONSIBILITY_INHERITANCE_RULES.md](location-architecture/05_RESPONSIBILITY_INHERITANCE_RULES.md) | HISTORICAL |
| [06_DEPARTMENT_DATA_VISIBILITY.md](location-architecture/06_DEPARTMENT_DATA_VISIBILITY.md) | HISTORICAL |
| [07_DOMAIN_LOCATION_LINK_MATRIX.md](location-architecture/07_DOMAIN_LOCATION_LINK_MATRIX.md) | HISTORICAL |
| [08_ROUTE_AND_PIN_COMPATIBILITY.md](location-architecture/08_ROUTE_AND_PIN_COMPATIBILITY.md) | HISTORICAL |
| [09_MIGRATION_AND_ROLLOUT_PLAN.md](location-architecture/09_MIGRATION_AND_ROLLOUT_PLAN.md) | HISTORICAL |
| [10_LOCATION_MODEL_CERTIFICATION.md](location-architecture/10_LOCATION_MODEL_CERTIFICATION.md) | HISTORICAL |

### location-projection (10)

| File | Status |
| --- | --- |
| [01_CURRENT_ARCHITECTURE.md](location-projection/01_CURRENT_ARCHITECTURE.md) | SUPERSEDED |
| [02_PROJECTION_MODEL.md](location-projection/02_PROJECTION_MODEL.md) | SUPERSEDED |
| [03_DEPARTMENT_PROJECTION.md](location-projection/03_DEPARTMENT_PROJECTION.md) | SUPERSEDED |
| [04_LOCATION_EXPERIENCE.md](location-projection/04_LOCATION_EXPERIENCE.md) | SUPERSEDED |
| [05_PROJECTION_ENGINE.md](location-projection/05_PROJECTION_ENGINE.md) | SUPERSEDED |
| [06_NAVIGATION_PROJECTION.md](location-projection/06_NAVIGATION_PROJECTION.md) | SUPERSEDED |
| [07_OPERATIONAL_VISIBILITY.md](location-projection/07_OPERATIONAL_VISIBILITY.md) | SUPERSEDED |
| [08_STAGE_PLAN.md](location-projection/08_STAGE_PLAN.md) | SUPERSEDED |
| [09_REGRESSION_ANALYSIS.md](location-projection/09_REGRESSION_ANALYSIS.md) | SUPERSEDED |
| [10_RECOMMENDATION.md](location-projection/10_RECOMMENDATION.md) | SUPERSEDED |

### onboarding (42)

| File | Status |
| --- | --- |
| [DECISIONS.md](onboarding/DECISIONS.md) | HISTORICAL |
| [ONB_00_BASELINE_2026-10-17.json](onboarding/ONB_00_BASELINE_2026-10-17.json) | HISTORICAL |
| [ONB_01_VERIFICATION_2026-10-17.json](onboarding/ONB_01_VERIFICATION_2026-10-17.json) | HISTORICAL |
| [ONB_02_VERIFICATION_2026-10-17.json](onboarding/ONB_02_VERIFICATION_2026-10-17.json) | HISTORICAL |
| [ONB_03_VERIFICATION_2026-10-17.json](onboarding/ONB_03_VERIFICATION_2026-10-17.json) | HISTORICAL |
| [ONB_04_CSV_CONTRACT.md](onboarding/ONB_04_CSV_CONTRACT.md) | HISTORICAL |
| [ONB_04_VERIFICATION_2026-10-18.json](onboarding/ONB_04_VERIFICATION_2026-10-18.json) | HISTORICAL |
| [ONB_05_SERVICE_CONTRACT.md](onboarding/ONB_05_SERVICE_CONTRACT.md) | HISTORICAL |
| [ONB_05_VERIFICATION_2026-10-18.json](onboarding/ONB_05_VERIFICATION_2026-10-18.json) | HISTORICAL |
| [ONB_06_VERIFICATION_2026-10-18.json](onboarding/ONB_06_VERIFICATION_2026-10-18.json) | HISTORICAL |
| [ONB_06_WORKBOOK_CONTRACT.md](onboarding/ONB_06_WORKBOOK_CONTRACT.md) | HISTORICAL |
| [ONB_07_CANDIDATE_INCLUSION_2026-10-19.json](onboarding/ONB_07_CANDIDATE_INCLUSION_2026-10-19.json) | HISTORICAL |
| [ONB_07_CANDIDATE_INCLUSION_PRE_FR01_2026-10-19.json](onboarding/ONB_07_CANDIDATE_INCLUSION_PRE_FR01_2026-10-19.json) | HISTORICAL |
| [ONB_07_CANONICAL_SPACE_OFFLINE_PLAN.md](onboarding/ONB_07_CANONICAL_SPACE_OFFLINE_PLAN.md) | HISTORICAL |
| [ONB_07_CERTIFICATION_2026-10-18.md](onboarding/ONB_07_CERTIFICATION_2026-10-18.md) | HISTORICAL |
| [ONB_07_FINAL_REVIEW_HANDOFF_2026-10-19.md](onboarding/ONB_07_FINAL_REVIEW_HANDOFF_2026-10-19.md) | HISTORICAL |
| [ONB_07_FINAL_REVIEW_PRE_FR01_2026-10-19.md](onboarding/ONB_07_FINAL_REVIEW_PRE_FR01_2026-10-19.md) | HISTORICAL |
| [ONB_07_FINAL_REVIEW_VERIFICATION_2026-10-19.json](onboarding/ONB_07_FINAL_REVIEW_VERIFICATION_2026-10-19.json) | HISTORICAL |
| [ONB_07_FOLLOWUP_2026-10-19.md](onboarding/ONB_07_FOLLOWUP_2026-10-19.md) | HISTORICAL |
| [ONB_07_FOLLOWUP_VERIFICATION_2026-10-19.json](onboarding/ONB_07_FOLLOWUP_VERIFICATION_2026-10-19.json) | HISTORICAL |
| [ONB_07_INTERNAL_TEST_RELEASE_2026-10-20.md](onboarding/ONB_07_INTERNAL_TEST_RELEASE_2026-10-20.md) | HISTORICAL |
| [ONB_07_OFFLINE_PLANNING_2026-10-19.json](onboarding/ONB_07_OFFLINE_PLANNING_2026-10-19.json) | HISTORICAL |
| [ONB_07_PILOT_CHECKLIST.md](onboarding/ONB_07_PILOT_CHECKLIST.md) | HISTORICAL |
| [ONB_07_RELEASE_BLOCKERS.md](onboarding/ONB_07_RELEASE_BLOCKERS.md) | HISTORICAL |
| [ONB_07_SPACE_DATE_LOCK_2026-10-19.md](onboarding/ONB_07_SPACE_DATE_LOCK_2026-10-19.md) | HISTORICAL |
| [ONB_07_SPACE_DATE_LOCK_VERIFICATION_2026-10-19.json](onboarding/ONB_07_SPACE_DATE_LOCK_VERIFICATION_2026-10-19.json) | HISTORICAL |
| [ONB_07_SPACE_OFFLINE_CERTIFICATION_2026-10-19.md](onboarding/ONB_07_SPACE_OFFLINE_CERTIFICATION_2026-10-19.md) | HISTORICAL |
| [ONB_07_SPACE_OFFLINE_CONTRACT.md](onboarding/ONB_07_SPACE_OFFLINE_CONTRACT.md) | HISTORICAL |
| [ONB_07_SPACE_OFFLINE_VERIFICATION_2026-10-19.json](onboarding/ONB_07_SPACE_OFFLINE_VERIFICATION_2026-10-19.json) | HISTORICAL |
| [ONB_07_STABILIZATION.md](onboarding/ONB_07_STABILIZATION.md) | HISTORICAL |
| [ONB_07_STABILIZATION_VERIFICATION_2026-10-19.json](onboarding/ONB_07_STABILIZATION_VERIFICATION_2026-10-19.json) | HISTORICAL |
| [ONB_07_VERIFICATION_2026-10-18.json](onboarding/ONB_07_VERIFICATION_2026-10-18.json) | HISTORICAL |
| [ONB_07_WORKBOOK_CONTENTION_2026-10-19.md](onboarding/ONB_07_WORKBOOK_CONTENTION_2026-10-19.md) | HISTORICAL |
| [ONB_07_WORKBOOK_RETIREMENT_2026-10-19.md](onboarding/ONB_07_WORKBOOK_RETIREMENT_2026-10-19.md) | HISTORICAL |
| [ONB_07_WORKBOOK_RETIREMENT_VERIFICATION_2026-10-19.json](onboarding/ONB_07_WORKBOOK_RETIREMENT_VERIFICATION_2026-10-19.json) | HISTORICAL |
| [ONB_07_WORKBOOK_VERIFICATION_2026-10-19.json](onboarding/ONB_07_WORKBOOK_VERIFICATION_2026-10-19.json) | HISTORICAL |
| [PHASE_TRACKER.md](onboarding/PHASE_TRACKER.md) | HISTORICAL |
| [README.md](onboarding/README.md) | CURRENT WITH GAPS |
| [REPOSITORY_RENAME_CHECKLIST.md](onboarding/REPOSITORY_RENAME_CHECKLIST.md) | HISTORICAL |
| [VERIFICATION_POLICY.md](onboarding/VERIFICATION_POLICY.md) | HISTORICAL |
| [VSSYL_ONBOARDING_AUDIT_2026-10-17.md](onboarding/VSSYL_ONBOARDING_AUDIT_2026-10-17.md) | HISTORICAL |
| [VSSYL_ONBOARDING_PHASED_PLAN_2026-10-17.md](onboarding/VSSYL_ONBOARDING_PHASED_PLAN_2026-10-17.md) | HISTORICAL |

### operational-projection (23)

| File | Status |
| --- | --- |
| [00_PROJECTION_INDEX.md](operational-projection/00_PROJECTION_INDEX.md) | SUPERSEDED |
| [01_OPERATIONAL_PROJECTION_CONSTITUTION.md](operational-projection/01_OPERATIONAL_PROJECTION_CONSTITUTION.md) | SUPERSEDED |
| [02_RUNTIME_PROJECTION_MODEL.md](operational-projection/02_RUNTIME_PROJECTION_MODEL.md) | SUPERSEDED |
| [03_PROJECTION_PIPELINE.md](operational-projection/03_PROJECTION_PIPELINE.md) | SUPERSEDED |
| [04_RUNTIME_LOCATION_MODEL.md](operational-projection/04_RUNTIME_LOCATION_MODEL.md) | SUPERSEDED |
| [05_RUNTIME_EXPERIENCE_MODEL.md](operational-projection/05_RUNTIME_EXPERIENCE_MODEL.md) | SUPERSEDED |
| [06_RUNTIME_WORKSPACE_MODEL.md](operational-projection/06_RUNTIME_WORKSPACE_MODEL.md) | SUPERSEDED |
| [07_RUNTIME_NAVIGATION_MODEL.md](operational-projection/07_RUNTIME_NAVIGATION_MODEL.md) | SUPERSEDED |
| [08_RUNTIME_PERMISSION_MODEL.md](operational-projection/08_RUNTIME_PERMISSION_MODEL.md) | SUPERSEDED |
| [09_RUNTIME_REFRESH_MODEL.md](operational-projection/09_RUNTIME_REFRESH_MODEL.md) | SUPERSEDED |
| [10_RUNTIME_CACHING_MODEL.md](operational-projection/10_RUNTIME_CACHING_MODEL.md) | SUPERSEDED |
| [11_RUNTIME_AI_INTEGRATION.md](operational-projection/11_RUNTIME_AI_INTEGRATION.md) | SUPERSEDED |
| [12_RUNTIME_QUERY_STRATEGY.md](operational-projection/12_RUNTIME_QUERY_STRATEGY.md) | SUPERSEDED |
| [13_RUNTIME_PERFORMANCE_MODEL.md](operational-projection/13_RUNTIME_PERFORMANCE_MODEL.md) | SUPERSEDED |
| [14_RUNTIME_FAILURE_MODEL.md](operational-projection/14_RUNTIME_FAILURE_MODEL.md) | SUPERSEDED |
| [15_IMPLEMENTATION_PROGRAM.md](operational-projection/15_IMPLEMENTATION_PROGRAM.md) | SUPERSEDED |
| [16_CERTIFICATION.md](operational-projection/16_CERTIFICATION.md) | SUPERSEDED |
| [17_WAVE_15G_SIDEBAR_CUTOVER.md](operational-projection/17_WAVE_15G_SIDEBAR_CUTOVER.md) | SUPERSEDED |
| [18_WAVE_15H_UNIT_WORKSPACE.md](operational-projection/18_WAVE_15H_UNIT_WORKSPACE.md) | SUPERSEDED |
| [19_WAVE_15I_TODAYS_WORK.md](operational-projection/19_WAVE_15I_TODAYS_WORK.md) | SUPERSEDED |
| [20_WAVE_15J_OPERATIONS_CENTER.md](operational-projection/20_WAVE_15J_OPERATIONS_CENTER.md) | SUPERSEDED |
| [21_WAVE_15K_BUSINESS_WORKSPACE.md](operational-projection/21_WAVE_15K_BUSINESS_WORKSPACE.md) | SUPERSEDED |
| [22_LOCATION_EXPERIENCE_CERTIFICATION_FIX.md](operational-projection/22_LOCATION_EXPERIENCE_CERTIFICATION_FIX.md) | SUPERSEDED |

### operations (12)

| File | Status |
| --- | --- |
| [DIETARY_ASSIGNMENTS_AND_COVERAGE_PHASE_7A_2026-08-05.md](operations/DIETARY_ASSIGNMENTS_AND_COVERAGE_PHASE_7A_2026-08-05.md) | HISTORICAL |
| [DIETARY_EMPLOYEE_JOB_FLOW_GUIDE.md](operations/DIETARY_EMPLOYEE_JOB_FLOW_GUIDE.md) | HISTORICAL |
| [DIETARY_EMPLOYEE_JOB_FLOW_PHASE_9B_2026-08-06.md](operations/DIETARY_EMPLOYEE_JOB_FLOW_PHASE_9B_2026-08-06.md) | HISTORICAL |
| [DIETARY_LOG_BOOK_GUIDE.md](operations/DIETARY_LOG_BOOK_GUIDE.md) | SUPERSEDED |
| [DIETARY_OPERATIONAL_CYCLES_MANAGER_GUIDE.md](operations/DIETARY_OPERATIONAL_CYCLES_MANAGER_GUIDE.md) | HISTORICAL |
| [DIETARY_OPERATIONAL_CYCLES_PHASE_9A_2026-08-06.md](operations/DIETARY_OPERATIONAL_CYCLES_PHASE_9A_2026-08-06.md) | HISTORICAL |
| [DIETARY_OPERATIONAL_EVIDENCE_PHASE_9C_2026-08-06.md](operations/DIETARY_OPERATIONAL_EVIDENCE_PHASE_9C_2026-08-06.md) | HISTORICAL |
| [DIETARY_OPERATIONAL_EVIDENCE_PHASE_9C_OWNERSHIP_2026-08-06.md](operations/DIETARY_OPERATIONAL_EVIDENCE_PHASE_9C_OWNERSHIP_2026-08-06.md) | HISTORICAL |
| [DIETARY_OPERATIONAL_TEMPLATE_MANAGER_GUIDE.md](operations/DIETARY_OPERATIONAL_TEMPLATE_MANAGER_GUIDE.md) | SUPERSEDED |
| [DIETARY_SUPERVISOR_OPERATIONS_BOARD_GUIDE.md](operations/DIETARY_SUPERVISOR_OPERATIONS_BOARD_GUIDE.md) | HISTORICAL |
| [DIETARY_TEMPLATE_BUILDER_PHASE_9C1_2026-08-06.md](operations/DIETARY_TEMPLATE_BUILDER_PHASE_9C1_2026-08-06.md) | HISTORICAL |
| [LOGS_ARCHITECTURE_CONTRACT_PHASE_2_2026-09-13.md](operations/LOGS_ARCHITECTURE_CONTRACT_PHASE_2_2026-09-13.md) | SUPERSEDED |

### pilot (5)

| File | Status |
| --- | --- |
| [DIETARY_V1_EMPLOYEE_TABLET_GUIDE.md](pilot/DIETARY_V1_EMPLOYEE_TABLET_GUIDE.md) | ARCHIVE CANDIDATE |
| [DIETARY_V1_FALLBACK_AND_RECOVERY.md](pilot/DIETARY_V1_FALLBACK_AND_RECOVERY.md) | ARCHIVE CANDIDATE |
| [DIETARY_V1_GM_DAILY_REVIEW.md](pilot/DIETARY_V1_GM_DAILY_REVIEW.md) | ARCHIVE CANDIDATE |
| [DIETARY_V1_PILOT_READINESS_CERTIFICATION_2026-08-05.md](pilot/DIETARY_V1_PILOT_READINESS_CERTIFICATION_2026-08-05.md) | ARCHIVE CANDIDATE |
| [DIETARY_V1_SUPERVISOR_QUICK_START.md](pilot/DIETARY_V1_SUPERVISOR_QUICK_START.md) | ARCHIVE CANDIDATE |

### plant (24)

| File | Status |
| --- | --- |
| [CROSS_DEPARTMENT_SERVICE_REQUEST_GUIDE.md](plant/CROSS_DEPARTMENT_SERVICE_REQUEST_GUIDE.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_2_CERTIFICATION_2026-10-05.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_2_CERTIFICATION_2026-10-05.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_2_PLAN_2026-10-05.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_2_PLAN_2026-10-05.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_3A_CERTIFICATION_2026-10-05.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_3A_CERTIFICATION_2026-10-05.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_3B_CERTIFICATION_2026-10-05.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_3B_CERTIFICATION_2026-10-05.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_3C_CERTIFICATION_2026-10-05.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_3C_CERTIFICATION_2026-10-05.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_3D_CERTIFICATION_2026-10-06.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_3D_CERTIFICATION_2026-10-06.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_3_PLAN_2026-10-05.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_3_PLAN_2026-10-05.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_4A_CERTIFICATION_2026-10-06.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_4A_CERTIFICATION_2026-10-06.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_4B_CERTIFICATION_2026-10-06.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_4B_CERTIFICATION_2026-10-06.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_4C_CERTIFICATION_2026-10-06.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_4C_CERTIFICATION_2026-10-06.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_4D_CERTIFICATION_2026-10-06.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_4D_CERTIFICATION_2026-10-06.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_4_ARCHITECTURE_2026-10-06.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_4_ARCHITECTURE_2026-10-06.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_5A_CERTIFICATION_2026-10-06.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_5A_CERTIFICATION_2026-10-06.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_PHASE_5B_CERTIFICATION_2026-10-06.md](plant/FACILITY_PLANT_OPERATIONS_PHASE_5B_CERTIFICATION_2026-10-06.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-05.md](plant/FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-05.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-06.md](plant/FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-06.md) | HISTORICAL |
| [FACILITY_PLANT_OPERATIONS_V1_RELEASE_CERTIFICATION_2026-10-06.md](plant/FACILITY_PLANT_OPERATIONS_V1_RELEASE_CERTIFICATION_2026-10-06.md) | HISTORICAL |
| [PLANT_MANAGER_SETUP_GUIDE.md](plant/PLANT_MANAGER_SETUP_GUIDE.md) | HISTORICAL |
| [PLANT_OPERATIONS_REFERENCE_PHASE_12A_2026-08-07.md](plant/PLANT_OPERATIONS_REFERENCE_PHASE_12A_2026-08-07.md) | HISTORICAL |
| [PLANT_PHASE_12A_OWNERSHIP_DECISION_2026-08-07.md](plant/PLANT_PHASE_12A_OWNERSHIP_DECISION_2026-08-07.md) | HISTORICAL |
| [PLANT_SUPERVISOR_GUIDE.md](plant/PLANT_SUPERVISOR_GUIDE.md) | HISTORICAL |
| [PLANT_TECHNICIAN_GUIDE.md](plant/PLANT_TECHNICIAN_GUIDE.md) | HISTORICAL |
| [README.md](plant/README.md) | HISTORICAL |

### platform-vision (7)

| File | Status |
| --- | --- |
| [ARCHITECTURE_DECISION_LOG.md](platform-vision/ARCHITECTURE_DECISION_LOG.md) | HISTORICAL |
| [CURRENT_STATE_VS_TARGET_STATE.md](platform-vision/CURRENT_STATE_VS_TARGET_STATE.md) | HISTORICAL |
| [DOMAIN_MODEL_TARGET.md](platform-vision/DOMAIN_MODEL_TARGET.md) | SUPERSEDED |
| [FIRST_PRODUCT_SLICE.md](platform-vision/FIRST_PRODUCT_SLICE.md) | HISTORICAL |
| [OPERATION_MODEL.md](platform-vision/OPERATION_MODEL.md) | SUPERSEDED |
| [PRODUCT_CONSTITUTION.md](platform-vision/PRODUCT_CONSTITUTION.md) | SUPERSEDED |
| [RETIRED.md](platform-vision/RETIRED.md) | HISTORICAL |

### product (33)

| File | Status |
| --- | --- |
| [01A_DEPARTMENT_BUILDER_FOUNDATION_AMENDMENT_2026-11-01.md](product/01A_DEPARTMENT_BUILDER_FOUNDATION_AMENDMENT_2026-11-01.md) | CURRENT |
| [01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md](product/01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md) | CURRENT |
| [01C_PRELAUNCH_CANONICAL_RESET_AMENDMENT_2026-11-10.md](product/01C_PRELAUNCH_CANONICAL_RESET_AMENDMENT_2026-11-10.md) | CURRENT |
| [01_PRODUCT_CONSTITUTION.md](product/01_PRODUCT_CONSTITUTION.md) | CURRENT |
| [02_PRODUCT_CAPABILITY_MODEL.md](product/02_PRODUCT_CAPABILITY_MODEL.md) | HISTORICAL |
| [03_PRODUCT_DOMAIN_MODEL.md](product/03_PRODUCT_DOMAIN_MODEL.md) | CURRENT WITH GAPS |
| [04_PERSONA_MODEL.md](product/04_PERSONA_MODEL.md) | CURRENT WITH GAPS |
| [05_OPERATIONAL_PHILOSOPHY.md](product/05_OPERATIONAL_PHILOSOPHY.md) | CURRENT WITH GAPS |
| [06_NAVIGATION_MODEL.md](product/06_NAVIGATION_MODEL.md) | SUPERSEDED |
| [07_PRODUCT_BOUNDARIES.md](product/07_PRODUCT_BOUNDARIES.md) | CURRENT WITH GAPS |
| [08_PRODUCT_LANGUAGE_GUIDE.md](product/08_PRODUCT_LANGUAGE_GUIDE.md) | CURRENT |
| [09_PRODUCT_DECISION_MODEL.md](product/09_PRODUCT_DECISION_MODEL.md) | CURRENT WITH GAPS |
| [10_PRODUCT_ROADMAP.md](product/10_PRODUCT_ROADMAP.md) | HISTORICAL |
| [11_COMMERCIAL_MODEL.md](product/11_COMMERCIAL_MODEL.md) | CURRENT |
| [12_VSSYL_BRAND.md](product/12_VSSYL_BRAND.md) | CURRENT |
| [13_DEPARTMENT_PRODUCT.md](product/13_DEPARTMENT_PRODUCT.md) | CURRENT |
| [14_FACILITY_PLANT_OPERATIONS.md](product/14_FACILITY_PLANT_OPERATIONS.md) | CURRENT |
| [15A_DEPARTMENT_BUILDER_REGISTRY_AMENDMENT_2026-11-01.md](product/15A_DEPARTMENT_BUILDER_REGISTRY_AMENDMENT_2026-11-01.md) | HISTORICAL |
| [15_PLATFORM_PRIMITIVES_AND_ENGINES_REGISTRY.md](product/15_PLATFORM_PRIMITIVES_AND_ENGINES_REGISTRY.md) | CURRENT |
| [16_DEPARTMENT_BUILDER_ARCHITECTURE.md](product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md) | CURRENT |
| [16_NOTIFICATIONS_AND_ATTENTION.md](product/16_NOTIFICATIONS_AND_ATTENTION.md) | CURRENT WITH GAPS |
| [CANONICAL_RECORD_PILOT_RUNBOOK.md](product/CANONICAL_RECORD_PILOT_RUNBOOK.md) | HISTORICAL |
| [LEGACY_SURFACE_REGISTER.md](product/LEGACY_SURFACE_REGISTER.md) | HISTORICAL |
| [LTC_MANAGER_ADMIN_BOUNDARY.md](product/LTC_MANAGER_ADMIN_BOUNDARY.md) | HISTORICAL |
| [LTC_MANAGER_BUILD_GUIDE.md](product/LTC_MANAGER_BUILD_GUIDE.md) | SUPERSEDED |
| [LTC_MANAGER_BUILD_RUN_INFORMATION_ARCHITECTURE_2026-08-08.md](product/LTC_MANAGER_BUILD_RUN_INFORMATION_ARCHITECTURE_2026-08-08.md) | SUPERSEDED |
| [LTC_MANAGER_RUN_GUIDE.md](product/LTC_MANAGER_RUN_GUIDE.md) | SUPERSEDED |
| [LTC_MANAGER_RUN_SURFACE_RATIONALIZATION_2026-08-09.md](product/LTC_MANAGER_RUN_SURFACE_RATIONALIZATION_2026-08-09.md) | SUPERSEDED |
| [LTC_MANAGER_V1_BULK_ONBOARDING_IMPORTS_2026-08-09.md](product/LTC_MANAGER_V1_BULK_ONBOARDING_IMPORTS_2026-08-09.md) | HISTORICAL |
| [LTC_MANAGER_V1_SHELL_UX_REFINEMENT_2026-08-09.md](product/LTC_MANAGER_V1_SHELL_UX_REFINEMENT_2026-08-09.md) | HISTORICAL |
| [LTC_MANAGER_V1_UX_COMPLETION_PHASE_14_2026-08-08.md](product/LTC_MANAGER_V1_UX_COMPLETION_PHASE_14_2026-08-08.md) | HISTORICAL |
| [NEW_DEPARTMENT_PRODUCT_IMPLEMENTATION_GUIDE.md](product/NEW_DEPARTMENT_PRODUCT_IMPLEMENTATION_GUIDE.md) | CURRENT |
| [README.md](product/README.md) | CURRENT |

### product-reference (11)

| File | Status |
| --- | --- |
| [00_PRODUCT_REFERENCE_INDEX.md](product-reference/00_PRODUCT_REFERENCE_INDEX.md) | HISTORICAL |
| [01_NAVIGATION_SYSTEM.md](product-reference/01_NAVIGATION_SYSTEM.md) | HISTORICAL |
| [02_OPERATIONS_CENTER_REFERENCE.md](product-reference/02_OPERATIONS_CENTER_REFERENCE.md) | HISTORICAL |
| [03_UNIT_WORKSPACE_REFERENCE.md](product-reference/03_UNIT_WORKSPACE_REFERENCE.md) | HISTORICAL |
| [04_SUPERVISOR_REFERENCE.md](product-reference/04_SUPERVISOR_REFERENCE.md) | HISTORICAL |
| [05_EMPLOYEE_REFERENCE.md](product-reference/05_EMPLOYEE_REFERENCE.md) | HISTORICAL |
| [06_OPERATION_FLOW_REFERENCE.md](product-reference/06_OPERATION_FLOW_REFERENCE.md) | HISTORICAL |
| [07_OPERATIONAL_OBJECTS.md](product-reference/07_OPERATIONAL_OBJECTS.md) | HISTORICAL |
| [08_AI_EXPERIENCE_REFERENCE.md](product-reference/08_AI_EXPERIENCE_REFERENCE.md) | HISTORICAL |
| [09_DESIGN_PRINCIPLES.md](product-reference/09_DESIGN_PRINCIPLES.md) | HISTORICAL |
| [10_PRODUCT_REFERENCE_CERTIFICATION.md](product-reference/10_PRODUCT_REFERENCE_CERTIFICATION.md) | HISTORICAL |

### reference-capabilities (11)

| File | Status |
| --- | --- |
| [00_REFERENCE_CAPABILITIES_INDEX.md](reference-capabilities/00_REFERENCE_CAPABILITIES_INDEX.md) | ARCHIVE CANDIDATE |
| [01_OPERATION_READINESS.md](reference-capabilities/01_OPERATION_READINESS.md) | ARCHIVE CANDIDATE |
| [02_OPERATION_EXECUTION.md](reference-capabilities/02_OPERATION_EXECUTION.md) | ARCHIVE CANDIDATE |
| [03_WORKFORCE_AND_COVERAGE.md](reference-capabilities/03_WORKFORCE_AND_COVERAGE.md) | ARCHIVE CANDIDATE |
| [04_ISSUE_AND_RECOVERY.md](reference-capabilities/04_ISSUE_AND_RECOVERY.md) | ARCHIVE CANDIDATE |
| [05_ASSET_AND_LOCATION.md](reference-capabilities/05_ASSET_AND_LOCATION.md) | ARCHIVE CANDIDATE |
| [06_SUPPLY_AND_RESOURCES.md](reference-capabilities/06_SUPPLY_AND_RESOURCES.md) | ARCHIVE CANDIDATE |
| [07_OPERATIONAL_KNOWLEDGE.md](reference-capabilities/07_OPERATIONAL_KNOWLEDGE.md) | ARCHIVE CANDIDATE |
| [08_OPERATIONAL_INTELLIGENCE.md](reference-capabilities/08_OPERATIONAL_INTELLIGENCE.md) | ARCHIVE CANDIDATE |
| [09_ANALYTICS_AND_CONTINUOUS_IMPROVEMENT.md](reference-capabilities/09_ANALYTICS_AND_CONTINUOUS_IMPROVEMENT.md) | ARCHIVE CANDIDATE |
| [10_REFERENCE_CERTIFICATION.md](reference-capabilities/10_REFERENCE_CERTIFICATION.md) | ARCHIVE CANDIDATE |

### reference-ux (11)

| File | Status |
| --- | --- |
| [00_REFERENCE_UX_INDEX.md](reference-ux/00_REFERENCE_UX_INDEX.md) | ARCHIVE CANDIDATE |
| [01_OPERATIONS_CENTER.md](reference-ux/01_OPERATIONS_CENTER.md) | ARCHIVE CANDIDATE |
| [02_UNIT_WORKSPACE.md](reference-ux/02_UNIT_WORKSPACE.md) | ARCHIVE CANDIDATE |
| [03_SUPERVISOR_WORKSPACE.md](reference-ux/03_SUPERVISOR_WORKSPACE.md) | ARCHIVE CANDIDATE |
| [04_EMPLOYEE_WORKSPACE.md](reference-ux/04_EMPLOYEE_WORKSPACE.md) | ARCHIVE CANDIDATE |
| [05_OPERATION_TIMELINE.md](reference-ux/05_OPERATION_TIMELINE.md) | ARCHIVE CANDIDATE |
| [06_OPERATIONAL_AWARENESS.md](reference-ux/06_OPERATIONAL_AWARENESS.md) | ARCHIVE CANDIDATE |
| [07_OPERATIONAL_RECOVERY.md](reference-ux/07_OPERATIONAL_RECOVERY.md) | ARCHIVE CANDIDATE |
| [08_OPERATIONAL_KNOWLEDGE.md](reference-ux/08_OPERATIONAL_KNOWLEDGE.md) | ARCHIVE CANDIDATE |
| [09_OPERATIONAL_AI.md](reference-ux/09_OPERATIONAL_AI.md) | ARCHIVE CANDIDATE |
| [10_REFERENCE_CERTIFICATION.md](reference-ux/10_REFERENCE_CERTIFICATION.md) | ARCHIVE CANDIDATE |

### security (30)

| File | Status |
| --- | --- |
| [ACCOUNT_SESSION_PHASE_2E5_2026-10-10.md](security/ACCOUNT_SESSION_PHASE_2E5_2026-10-10.md) | HISTORICAL |
| [AUTHORIZATION_HARDENING_PHASE_1_2026-08-04.md](security/AUTHORIZATION_HARDENING_PHASE_1_2026-08-04.md) | HISTORICAL |
| [AUTHORIZATION_HARDENING_PHASE_2_2026-08-04.md](security/AUTHORIZATION_HARDENING_PHASE_2_2026-08-04.md) | HISTORICAL |
| [AUTHORIZATION_INTEGRITY_PHASE_4_2026-08-05.md](security/AUTHORIZATION_INTEGRITY_PHASE_4_2026-08-05.md) | HISTORICAL |
| [AVAILABLE_CONTEXT_RESOLVER_PHASE_2E4_2026-10-10.md](security/AVAILABLE_CONTEXT_RESOLVER_PHASE_2E4_2026-10-10.md) | HISTORICAL |
| [FACILITY_PARTNER_AUTHORITY_PHASE_2A_2026-10-07.md](security/FACILITY_PARTNER_AUTHORITY_PHASE_2A_2026-10-07.md) | HISTORICAL |
| [GLOBAL_USER_NAV_ACCOUNT_PHASE_2E8A_2026-10-10.md](security/GLOBAL_USER_NAV_ACCOUNT_PHASE_2E8A_2026-10-10.md) | HISTORICAL |
| [GLOBAL_USER_PROFILE_SECURITY_PHASE_2E8B_2026-10-10.md](security/GLOBAL_USER_PROFILE_SECURITY_PHASE_2E8B_2026-10-10.md) | HISTORICAL |
| [HFN_POST_IDENTITY_INTEGRATION_CERTIFICATION_2026-10-11.md](security/HFN_POST_IDENTITY_INTEGRATION_CERTIFICATION_2026-10-11.md) | HISTORICAL |
| [INTERNAL_FACILITY_ROLE_AUTHORITY_PHASE_2E1_2026-10-10.md](security/INTERNAL_FACILITY_ROLE_AUTHORITY_PHASE_2E1_2026-10-10.md) | HISTORICAL |
| [LOGIN_CONTEXT_ROUTING_PHASE_2E7_2026-10-10.md](security/LOGIN_CONTEXT_ROUTING_PHASE_2E7_2026-10-10.md) | HISTORICAL |
| [MY_ACCESS_UI_PHASE_2E6_2026-10-10.md](security/MY_ACCESS_UI_PHASE_2E6_2026-10-10.md) | HISTORICAL |
| [ONBOARDING_CONTEXT_ENTRY_PHASE_2E7B_2026-10-10.md](security/ONBOARDING_CONTEXT_ENTRY_PHASE_2E7B_2026-10-10.md) | HISTORICAL |
| [ORGANIZATION_CLAIM_PHASE_2B2_2026-10-07.md](security/ORGANIZATION_CLAIM_PHASE_2B2_2026-10-07.md) | HISTORICAL |
| [ORGANIZATION_MEMBERSHIP_PHASE_2B1_2026-10-07.md](security/ORGANIZATION_MEMBERSHIP_PHASE_2B1_2026-10-07.md) | HISTORICAL |
| [ORGANIZATION_MEMBER_ADMINISTRATION_PHASE_2B3_2026-10-07.md](security/ORGANIZATION_MEMBER_ADMINISTRATION_PHASE_2B3_2026-10-07.md) | HISTORICAL |
| [ORGANIZATION_MEMBER_CLIENT_ASSIGNMENT_PHASE_3B_2026-10-11.md](security/ORGANIZATION_MEMBER_CLIENT_ASSIGNMENT_PHASE_3B_2026-10-11.md) | HISTORICAL |
| [ORGANIZATION_PORTFOLIO_PHASE_3A_2026-10-11.md](security/ORGANIZATION_PORTFOLIO_PHASE_3A_2026-10-11.md) | HISTORICAL |
| [PARTNER_ASSETS_PHASE_2D6A_2026-10-09.md](security/PARTNER_ASSETS_PHASE_2D6A_2026-10-09.md) | HISTORICAL |
| [PARTNER_CANONICAL_LOG_READS_PHASE_2D2_2026-10-08.md](security/PARTNER_CANONICAL_LOG_READS_PHASE_2D2_2026-10-08.md) | HISTORICAL |
| [PARTNER_CANONICAL_LOG_WRITES_PHASE_2D3_2026-10-08.md](security/PARTNER_CANONICAL_LOG_WRITES_PHASE_2D3_2026-10-08.md) | HISTORICAL |
| [PARTNER_DASHBOARD_PHASE_2D7_2026-10-09.md](security/PARTNER_DASHBOARD_PHASE_2D7_2026-10-09.md) | HISTORICAL |
| [PARTNER_FACILITY_SESSION_PHASE_2C2_2026-10-08.md](security/PARTNER_FACILITY_SESSION_PHASE_2C2_2026-10-08.md) | HISTORICAL |
| [PARTNER_LOCATIONS_PHASE_2D5A_2026-10-09.md](security/PARTNER_LOCATIONS_PHASE_2D5A_2026-10-09.md) | HISTORICAL |
| [PARTNER_OPERATIONAL_SCOPE_PHASE_2D1_2026-10-08.md](security/PARTNER_OPERATIONAL_SCOPE_PHASE_2D1_2026-10-08.md) | HISTORICAL |
| [PARTNER_REVIEW_PHASE_2D4_2026-10-09.md](security/PARTNER_REVIEW_PHASE_2D4_2026-10-09.md) | HISTORICAL |
| [PARTNER_STAFFING_GOVERNANCE_PHASE_2C1B_A_2026-10-09.md](security/PARTNER_STAFFING_GOVERNANCE_PHASE_2C1B_A_2026-10-09.md) | HISTORICAL |
| [PARTNER_USER_ASSIGNMENT_PHASE_2C1_2026-10-08.md](security/PARTNER_USER_ASSIGNMENT_PHASE_2C1_2026-10-08.md) | HISTORICAL |
| [RUNTIME_HARDENING_PHASE_3_2026-08-04.md](security/RUNTIME_HARDENING_PHASE_3_2026-08-04.md) | HISTORICAL |
| [USER_EMPLOYEE_IDENTITY_LINK_PHASE_2E2_2026-10-10.md](security/USER_EMPLOYEE_IDENTITY_LINK_PHASE_2E2_2026-10-10.md) | HISTORICAL |

### Top level (8)

| File | Status |
| --- | --- |
| [DOCUMENTATION_GAPS.md](DOCUMENTATION_GAPS.md) | CURRENT |
| [DOCUMENTATION_STATUS.md](DOCUMENTATION_STATUS.md) | CURRENT |
| [README.md](README.md) | CURRENT |
| [business-workspace-acceptance-checklist.md](business-workspace-acceptance-checklist.md) | SUPERSEDED |
| [operational-assignment-acceptance-checklist.md](operational-assignment-acceptance-checklist.md) | HISTORICAL |
| [operations-center-acceptance-checklist.md](operations-center-acceptance-checklist.md) | SUPERSEDED |
| [self-serve-smoke-test.md](self-serve-smoke-test.md) | CURRENT WITH GAPS |
| [unit-workspace-pin-flow-checklist.md](unit-workspace-pin-flow-checklist.md) | HISTORICAL |

### ui (24)

| File | Status |
| --- | --- |
| [responsive-review-2026-10-16/IMPLEMENTATION.md](ui/responsive-review-2026-10-16/IMPLEMENTATION.md) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/REVIEW_AND_PLAN.md](ui/responsive-review-2026-10-16/REVIEW_AND_PLAN.md) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/after/department-builder-compact.jpg](ui/responsive-review-2026-10-16/after/department-builder-compact.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/after/employees-compact.jpg](ui/responsive-review-2026-10-16/after/employees-compact.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/after/facility-menu-landscape.jpg](ui/responsive-review-2026-10-16/after/facility-menu-landscape.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/after/reports-compact.jpg](ui/responsive-review-2026-10-16/after/reports-compact.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/after/reports-tablet.jpg](ui/responsive-review-2026-10-16/after/reports-tablet.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/after/schedule-compact.jpg](ui/responsive-review-2026-10-16/after/schedule-compact.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/after/schedule-desktop.jpg](ui/responsive-review-2026-10-16/after/schedule-desktop.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/after/today-compact.jpg](ui/responsive-review-2026-10-16/after/today-compact.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/after/workspace-compact.jpg](ui/responsive-review-2026-10-16/after/workspace-compact.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/after/workspace-desktop.jpg](ui/responsive-review-2026-10-16/after/workspace-desktop.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/after/workspace-tablet.jpg](ui/responsive-review-2026-10-16/after/workspace-tablet.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/employees-compact.jpg](ui/responsive-review-2026-10-16/employees-compact.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/facility-menu-landscape.jpg](ui/responsive-review-2026-10-16/facility-menu-landscape.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/menus-tablet.jpg](ui/responsive-review-2026-10-16/menus-tablet.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/reports-compact.jpg](ui/responsive-review-2026-10-16/reports-compact.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/reports-tablet.jpg](ui/responsive-review-2026-10-16/reports-tablet.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/schedule-compact.jpg](ui/responsive-review-2026-10-16/schedule-compact.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/schedule-desktop.jpg](ui/responsive-review-2026-10-16/schedule-desktop.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/today-compact.jpg](ui/responsive-review-2026-10-16/today-compact.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/workspace-compact.jpg](ui/responsive-review-2026-10-16/workspace-compact.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/workspace-desktop.jpg](ui/responsive-review-2026-10-16/workspace-desktop.jpg) | ARCHIVE CANDIDATE |
| [responsive-review-2026-10-16/workspace-tablet.jpg](ui/responsive-review-2026-10-16/workspace-tablet.jpg) | ARCHIVE CANDIDATE |

### ux-exploration (1)

| File | Status |
| --- | --- |
| [workspace-selector-mock.html](ux-exploration/workspace-selector-mock.html) | ARCHIVE CANDIDATE |

### work (7)

| File | Status |
| --- | --- |
| [DIETARY_DEPARTMENT_WORK_PLANS_PHASE_11A_2026-08-06.md](work/DIETARY_DEPARTMENT_WORK_PLANS_PHASE_11A_2026-08-06.md) | HISTORICAL |
| [DIETARY_DEPARTMENT_WORK_PLANS_PHASE_11A_OWNERSHIP_2026-08-06.md](work/DIETARY_DEPARTMENT_WORK_PLANS_PHASE_11A_OWNERSHIP_2026-08-06.md) | HISTORICAL |
| [DIETARY_DEPARTMENT_WORK_PLANS_PHASE_11A_SCENARIO_CLASSIFICATIONS_2026-08-06.md](work/DIETARY_DEPARTMENT_WORK_PLANS_PHASE_11A_SCENARIO_CLASSIFICATIONS_2026-08-06.md) | HISTORICAL |
| [DIETARY_EMPLOYEE_WORK_GUIDE.md](work/DIETARY_EMPLOYEE_WORK_GUIDE.md) | SUPERSEDED |
| [DIETARY_SUPERVISOR_WORK_GUIDE.md](work/DIETARY_SUPERVISOR_WORK_GUIDE.md) | SUPERSEDED |
| [DIETARY_WORK_PLAN_MANAGER_GUIDE.md](work/DIETARY_WORK_PLAN_MANAGER_GUIDE.md) | SUPERSEDED |
| [TRANSACTIONAL_EMAIL_INVENTORY.md](work/TRANSACTIONAL_EMAIL_INVENTORY.md) | HISTORICAL |
