import { emptyTodaysExpectedWork, type TodaysExpectedWorkView } from "./types";

export {
  emptyTodaysExpectedWork,
  todaysExpectedWorkHasVisibleWork,
  type TodaysExpectedWorkItemView,
  type TodaysExpectedWorkLocationView,
  type TodaysExpectedWorkPlanView,
  type TodaysExpectedWorkView,
} from "./types";
export { loadTodaysExpectedWork } from "./load-expected-work";

export function presentExpectedWorkFromRequirements(): TodaysExpectedWorkView {
  return emptyTodaysExpectedWork();
}
