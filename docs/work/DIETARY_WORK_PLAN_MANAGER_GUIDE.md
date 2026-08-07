# Dietary Work Plan — Manager Guide

Work Plans define expected Dietary work steps for Units (and optional Spaces/Assets). They are not Assignments, Evidence, Milestones, or Procedures.

## Builder (`/staffing/work-plans`)

1. Create a blank draft or start from a preset (presets never auto-publish).
2. Edit items: label, timing (cycle or once/day), priority, responsibility (`Unit shared`), completion mode, Procedure link, linked Evidence template.
3. Preview the shape of requirements.
4. Publish — creates an immutable version (`stableKey` + `version`). Prior published versions of the same key retire on supersede.
5. Create a successor draft to change a published plan; retire when no longer prospective.

## Rules

- Draft Assignments never create frontline Work.
- Published plans + confirmed Assignments drive Runtime.
- Viewing a Procedure never completes Work.
- Linked Evidence: an accepted Evidence record can satisfy Work without a duplicate completion truth beyond optional audit.
