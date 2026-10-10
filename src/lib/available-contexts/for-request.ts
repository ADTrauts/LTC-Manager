import { cache } from "react";

import { prisma } from "@/lib/prisma";

import { listAvailableContextRecords } from "./list";

/**
 * Request-local memo of the live directory. Discarded when the request ends.
 * Do not use this as cross-request authorization cache.
 */
export const listAvailableContextsForRequest = cache(async (userId: string) => {
  return listAvailableContextRecords(prisma, { userId });
});
