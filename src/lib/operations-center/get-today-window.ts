export type TodayWindow = {
  start: Date;
  end: Date;
};

/** Local-calendar midnight through next midnight for service-date scoped queries. */
export function getTodayWindow(referenceDate: Date = new Date()): TodayWindow {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}
