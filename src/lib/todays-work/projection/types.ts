/**
 * Today's Work projection view.
 *
 * Projection supplies the Units the employee may see. Engines supply the
 * live walk, coverage, and handoffs.
 */

export type TodaysWorkProjectionView = {
  facilityId: string;
  lensMode: "DEPARTMENT" | "FACILITY";
  lensKey: string;
  /** Units that may appear in walk/coverage/handoffs (never broaden). */
  projectedUnitIds: readonly string[];
  /** Prefer actionable leaves' owning Units for ranking. */
  actionableUnitIds: readonly string[];
  error: string | null;
};
