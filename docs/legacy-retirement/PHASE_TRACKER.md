# Legacy Retirement — phase tracker

Updated October 20, 2026 (foundation review). This is the single status and authorization record for the [Legacy Retirement program](./README.md). Scope is in the [phased plan](./PHASED_PLAN.md). Decisions are in [DECISIONS.md](./DECISIONS.md).

| Phase | Status | Gate / dependency |
|---|---|---|
| LEG-00 — Decision record | **Accepted (user) October 20, 2026** | Docs only. |
| LEG-01 — Forward by default | Not started — not authorized | Requires authorization. LEG-Q03 and LEG-Q05 answered. Plant Departments excluded until LEG-02. With or before DSH-01. |
| LEG-02 — Records parity | Not started — not authorized | Requires LEG-01 exit and authorization. Plant scope approved (user) and LEG-Q01 answered (LEG-D18). Additive migrations only. |
| LEG-03 — Records cutover | Not started — not authorized | Requires LEG-02 exit, including facility-made forms (LEG-D19). Before CDA-04, preferred. |
| LEG-04 — People & Coverage | Not started — not authorized | Requires LEG-01 exit. LEG-Q04 answered (foundation round). |
| LEG-05 — Platform leftovers | Not started — not authorized | Requires LEG-03 exit and DSH-04 exit. `managementCompanyName` needs ONB scope and lands with CDA-05. Capability switches (LEG-D20) are decided. |
| LEG-06 — Schema cleanup | Not started — not authorized | Requires LEG-03, LEG-04 and LEG-05 exits, row counts and **explicit approval to drop tables**. LEG-Q02 answered: yes. |
| LEG-07 — First-customer gate | Not started — not authorized | Requires LEG-06 exit and DSH-04 exit. Before CDA-07 and before the first real customer. |

## LEG-00 record — October 20, 2026

### Delivered

- [x] Program record: [README](./README.md), [audit](./CURRENT_STATE_AUDIT_2026-10-20.md), [decisions](./DECISIONS.md), [phased plan](./PHASED_PLAN.md), this tracker.
- [x] Built from two code inventories (Records engines, then every other register surface). Load-bearing claims were checked against the code.
- [x] Cross-links:
  - CDA-D17 now points here.
  - The Dashboard reads only the forward Records engine (DSH-D19). This corrects the earlier Dashboard docs, which named a forward-engine loader as the legacy one.
- [x] Pointers in `AGENTS.md`, the root `README.md`, `docs/product/README.md`, `memory-bank/README.md` and the Legacy Surface Register.
- [x] Accepted by the product owner, October 20 afternoon.
- [x] Every existing facility moves to forward data. Each is kept, and its Records are set up again (LEG-Q03, LEG-Q05).
- [x] Plant round (5 answers):
  - Plant scope approved for this change (LEG-D06).
  - Vssyl publishes standard Plant and EVS forms (LEG-D17).
  - Plans require forms on each work order, with today's close-out and waiver rule. Checks with no repair work are scheduled Records. Vendor-run work orders use the vendor's forms (LEG-D18).

- [x] Department heads and vendors can make their own forms in the same Catalog (LEG-D19, answering LEG-Q06).
- [x] Foundation review: Department capability switches retire (LEG-D20). The old profile and Experience editor joins LEG-D12.
- [x] Foundation round: LEG-Q04 answered. Assignments and Job Flow are part of every Department. Removal of the meal-time guess (LEG-02, with LEG-D07) and the AI placeholder (LEG-05) is scheduled.

### Waiting on the product owner

1. Authorize LEG-01.

Every confirmation item is answered. LEG-Q02 was answered on October 20, evening: drop the tables in LEG-06, which still needs row counts and explicit approval at that step.
