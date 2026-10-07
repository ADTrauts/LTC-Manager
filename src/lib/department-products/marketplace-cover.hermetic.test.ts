import assert from "node:assert/strict";
import test from "node:test";

import { departmentProductCoverSrc } from "./marketplace-cover";

test("Department Product marketplace covers stay on known marketing assets", () => {
  assert.equal(
    departmentProductCoverSrc("HEALTHCARE_FOOD_NUTRITION"),
    "/marketing/hero-servery-morning.png",
  );
  assert.equal(departmentProductCoverSrc("PLANT"), "/marketing/dept-plant-ops.png");
  assert.equal(departmentProductCoverSrc("EVS"), "/marketing/dept-evs-cart.png");
  assert.equal(departmentProductCoverSrc("NOT_A_PRODUCT"), null);
});
