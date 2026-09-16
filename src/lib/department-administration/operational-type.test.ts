import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  operationalTypeKeyFromName,
  uniqueOperationalTypeKey,
} from "./operational-type";

describe("internal archetype key helpers", () => {
  it("slugs names into keys without exposing ids", () => {
    assert.equal(operationalTypeKeyFromName("Servery"), "servery");
    assert.equal(operationalTypeKeyFromName("Central Kitchen"), "central_kitchen");
  });

  it("keeps duplicate names unique by suffixing the key", () => {
    assert.equal(uniqueOperationalTypeKey("Servery", ["servery"]), "servery_2");
  });
});
