import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizeAssignmentScopeHierarchy } from "./assignment-scope-summary";

describe("assignment scope summary", () => {
  it("summarizes multi-floor Room sets as Floors A & B", () => {
    const label = summarizeAssignmentScopeHierarchy({
      locations: [
        {
          unitSpace: {
            name: "Naval Park",
            unit: {
              name: "Naval Park",
              hierarchyRole: "NEIGHBORHOOD",
              parentUnit: { name: "Floor 1", hierarchyRole: "FLOOR" },
            },
          },
        },
        {
          unitSpace: {
            name: "Canal",
            unit: {
              name: "Canal",
              hierarchyRole: "NEIGHBORHOOD",
              parentUnit: { name: "Floor 2", hierarchyRole: "FLOOR" },
            },
          },
        },
      ],
    });
    assert.equal(label, "Floors 1 & 2");
  });

  it("keeps single Room label", () => {
    const label = summarizeAssignmentScopeHierarchy({
      locations: [{ labelSnapshot: "Naval Park Servery" }],
    });
    assert.equal(label, "Naval Park Servery");
  });
});
