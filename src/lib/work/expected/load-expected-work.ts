import { emptyTodaysExpectedWork, type TodaysExpectedWorkView } from "./types";

export async function loadTodaysExpectedWork(
  _input?: unknown,
): Promise<TodaysExpectedWorkView> {
  return emptyTodaysExpectedWork();
}
