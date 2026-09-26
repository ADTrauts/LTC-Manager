/**
 * Exception-first Location card — display reduction of Runtime Location State answers.
 * Not persisted. Not a health score. Not the frozen hierarchy row.
 */

import type { StatusBadgeVariant, StatusProminence } from "@/lib/design-system/status-styles";
import type { RuntimeHappeningState, RuntimePace } from "@/lib/runtime-location-state";

export const EXCEPTION_FIRST_WRONG_LIMIT = 2;

export type ExceptionFirstPaceBadge = {
  variant: StatusBadgeVariant;
  label: string;
  prominence: StatusProminence;
};

export type ExceptionFirstLocationCardView = {
  spaceId: string;
  href: string | null;
  name: string;
  place: string | null;
  emphasized: boolean;
  pace: RuntimePace;
  happeningState: RuntimeHappeningState;
  badge: ExceptionFirstPaceBadge;
  happeningLabel: string;
  cycleLabel: string | null;
  responsibleLabel: string | null;
  wrongLabels: string[];
  moreWrongCount: number;
  evidenceLabel: string | null;
  nextLabel: string | null;
};

export type ExceptionFirstLocationBoardView = {
  cards: ExceptionFirstLocationCardView[];
  spaceCount: number;
  attentionCount: number;
};
