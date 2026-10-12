import type { AppJwtPayload } from "@/lib/auth";

import { currentContextKeyFromSession } from "./current-key";
import type { CurrentContextPresentation } from "./current-presentation";
import { listAvailableContextsForRequest } from "./for-request";
import { presentAvailableContexts } from "./presentation";
import { AvailableContextError } from "./types";
import type { AvailableContextPresentation } from "./types";

export type WorkspaceSelectorModel = {
  items: AvailableContextPresentation[];
  currentContextKey: string | null;
};

/**
 * Server-side selector directory for one User request.
 * PIN / Harbor never produce a model. Listing failure yields an empty list, not a kick-out.
 */
export async function loadWorkspaceSelectorModel(
  session: AppJwtPayload,
): Promise<WorkspaceSelectorModel | null> {
  if (session.authKind !== "user") return null;

  const currentContextKey = currentContextKeyFromSession(session);
  try {
    const records = await listAvailableContextsForRequest(session.uid);
    return {
      items: presentAvailableContexts(records),
      currentContextKey,
    };
  } catch (error) {
    if (error instanceof AvailableContextError) {
      return { items: [], currentContextKey };
    }
    return { items: [], currentContextKey };
  }
}

export type { CurrentContextPresentation };
