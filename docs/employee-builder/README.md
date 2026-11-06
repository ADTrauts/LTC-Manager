# Employee Builder

Operational eligibility is the accepted workforce fact. Read [OPERATIONAL_ELIGIBILITY.md](./OPERATIONAL_ELIGIBILITY.md).

The November 4 audit remains the trace of the older role systems: [ROLE_ARCHITECTURE_AUDIT_2026-11-04.md](./ROLE_ARCHITECTURE_AUDIT_2026-11-04.md). Department → Team → Role → Employee is a screen, not a database tree.

Phase 7B removed Department Job Role, Default Assignment, and the workstation eligibility map. Employee Builder is the authoring home for identity, Job Title, Department membership, Team membership, Team leadership, and operational eligibility. The Teams section on `/employees` creates, renames, assigns a lead, and archives a Team for the selected Department. Department Builder reads that result. Authority stays on RoleKey and is edited through the existing access path. A Team lead does not receive a RoleKey.
