import assert from "node:assert/strict";
import test from "node:test";
import { quoteScope, parseScope, deliveryEvidence } from "./contract";
import { quoteBilling } from "@/lib/billing/quote";
import { stripeCheckoutLineItemsForQuote, areStripePricesConfiguredForQuote } from "@/lib/billing/checkout-items";
const one = { departmentKeys: ["DIETARY"], deliverables: ["Map and review workforce CSV"] };
test("service policy: every engagement prices its first Department and each additional Department once",()=>{
  assert.equal(quoteScope(one).amountCents,150000);
  assert.equal(quoteScope({...one,departmentKeys:["DIETARY","PLANT"]}).amountCents,200000);
  assert.equal(quoteScope(one).amountCents,150000,"a later engagement has the same formula");
  assert.equal(quoteScope({...one,departmentKeys:["DIETARY","HEALTHCARE_FOOD_NUTRITION"]}).amountCents,150000,"aliases are one Product");
});
test("waiver binds owner, reason and exact scope; changes invalidate the quote digest",()=>{
  const paid=quoteScope(one),waived=quoteScope(one,{staffId:"owner",reason:"Approved customer service recovery"});
  assert.equal(waived.amountCents,0);assert.equal(waived.listAmountCents,150000);assert.notEqual(waived.digest,paid.digest);
  assert.notEqual(quoteScope({...one,deliverables:["Different deliverable"]}).digest,paid.digest);
  assert.throws(()=>quoteScope(one,{staffId:"owner",reason:" "}));
});
test("scope rejects missing and unpublished Products; evidence requires explicit delivered/deferred detail",()=>{
  assert.throws(()=>parseScope({...one,departmentKeys:[]}));assert.throws(()=>parseScope({...one,departmentKeys:["EVS"]}));
  assert.throws(()=>deliveryEvidence({stage:"TRAINING",disposition:"READY",notes:"done"}));
  assert.equal(deliveryEvidence({stage:"TRAINING",disposition:"DEFERRED",notes:"Customer requested next week's session"}).disposition,"DEFERRED");
});
test("self-service and assisted preferences both produce subscription-only checkout without setup Price configuration",()=>{
  const env={STRIPE_PRICE_FACILITY_MONTHLY:"price_sub",STRIPE_PRICE_ADDITIONAL_DEPT_MONTHLY:"price_add"};
  for(const setupPath of ["SELF_SERVE","ASSISTED"] as const){const q=quoteBilling({departmentCount:2,interval:"MONTHLY",setupPath});assert.deepEqual(stripeCheckoutLineItemsForQuote(q,env),[{price:"price_sub",quantity:1},{price:"price_add",quantity:1}]);assert.equal(areStripePricesConfiguredForQuote(q,env),true);}
});
