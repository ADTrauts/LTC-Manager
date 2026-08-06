import type { OperationalCycleType, ServeryMilestone } from "@prisma/client";

import type { CycleMilestoneStatusKey } from "@/lib/operational-cycles/milestone-cycle-status";

export type ExpectationInput = {
  cycleType: OperationalCycleType;
  /** Cycle description / approved Department guidance — shown as-is, never parsed into tasks. */
  description: string | null;
  label: string;
  expectedMilestones: readonly ServeryMilestone[];
  /** UnitMealTime scheduled time string (e.g. "12:15") — never invented. */
  mealTargetTime: string | null;
  milestoneKey: CycleMilestoneStatusKey | null;
  readyConfirmed: boolean;
  startedConfirmed: boolean;
};

export type ExpectationResult = {
  expectation: string;
  nextMilestoneExpectation: string | null;
};

/**
 * Pure rules for current expectation text from cycle type + milestones + meal target.
 * Do not parse free text into tasks. Do not invent Breakfast or unconfigured work.
 */
export function resolveCurrentExpectation(input: ExpectationInput): ExpectationResult {
  const expectsReady = input.expectedMilestones.includes("READY");
  const expectsStarted = input.expectedMilestones.includes("SERVICE_STARTED");

  switch (input.cycleType) {
    case "PREPARATION": {
      const guidance =
        input.description?.trim() ||
        `Prepare for ${input.label}.`;
      let next: string | null = null;
      if (expectsReady && !input.readyConfirmed) {
        next = "Confirm Servery Ready when preparation is complete.";
      } else if (expectsStarted && !input.startedConfirmed) {
        next = "Confirm Meal Service Started when serving begins.";
      }
      return { expectation: guidance, nextMilestoneExpectation: next };
    }

    case "SERVICE": {
      const targetPart = input.mealTargetTime
        ? ` Meal service target: ${input.mealTargetTime}.`
        : "";

      if (input.startedConfirmed) {
        return {
          expectation: `Meal Service Started is confirmed.${targetPart}`.trim(),
          nextMilestoneExpectation: null,
        };
      }

      // Ready is shown separately from Started expectation.
      const readyPart = input.readyConfirmed
        ? "Servery Ready is confirmed."
        : expectsReady
          ? "Servery Ready is not confirmed."
          : null;

      const startedPart = expectsStarted
        ? "Confirm Meal Service Started when serving begins."
        : null;

      const parts = [readyPart, startedPart].filter(Boolean);
      const expectation =
        (parts.length > 0 ? parts.join(" ") : `Service cycle: ${input.label}.`) +
        targetPart;

      return {
        expectation: expectation.trim(),
        nextMilestoneExpectation: startedPart,
      };
    }

    case "TRANSITION":
    case "CLOSEOUT":
    case "CUSTOM": {
      const expectation =
        input.description?.trim() ||
        `${input.label}.`;
      return { expectation, nextMilestoneExpectation: null };
    }

    default: {
      const expectation =
        input.description?.trim() ||
        `${input.label}.`;
      return { expectation, nextMilestoneExpectation: null };
    }
  }
}
