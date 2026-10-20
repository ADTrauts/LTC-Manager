import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { parseSource, hash, newReview, signReview, readReview, HEADERS, DATASETS, safeCsvCell, ImportError } from "./contract";
import { requireImportSession } from "./authority";
import { planImport } from "./planner";
import type { FacilitySession } from "@/lib/auth";
import type { Catalog } from "./catalog";

test("shared CSV keeps source bytes, leading zeros, physical multiline rows and original column provenance", () => {
  const source = parseSource("workforce",'email,first_name,lastName,phone\r\n"one@example.com","Jo\nAnne",Person,00123\r\ntwo@example.com,Casey,Person,00456\r\n',"people.csv");
  assert.equal(source.rows[0]!.values.phone,"00123"); assert.equal(source.rows[1]!.row,4);
  assert.deepEqual(source.columns[1],{ field: "firstName", header: "first_name", column: 2 });
  const bytes=Buffer.from("\ufeffemail\r\none@example.com\r\n");
  const decoded=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);
  assert.equal(parseSource("workforce",decoded,"bom.csv").sourceHash,createHash("sha256").update(bytes).digest("hex"));
  assert.notEqual(source.sourceHash,parseSource("workforce",'email,firstName\none@example.com,Jo\n',"people.csv").sourceHash);
});
test("all advertised datasets have header-only CSV templates and accept their own supported headers", () => {
  for (const dataset of DATASETS) {
    const cells = HEADERS[dataset].map(h => h === "email" ? "someone@example.com" : "");
    assert.equal(parseSource(dataset,HEADERS[dataset].join(",")+"\n"+cells.join(",")+",marker\n","source.csv").rows[0]!.errors.length,1);
    assert.throws(() => parseSource(dataset,HEADERS[dataset].join(",")+"\n","empty.csv"),/data row/);
  }
});
test("credential, lifecycle, unknown and duplicate headers are rejected rather than ignored", () => {
  for (const column of ["password","PIN","pinDigest","status","terminationDate","createdByUserId","not_a_field"]) assert.throws(() => parseSource("workforce",`email,${column}\none@example.com,secret\n`,"bad.csv"),/Unknown/);
  assert.throws(() => parseSource("workforce","email,firstName,first_name\none@example.com,Casey,Casey\n","duplicate.csv"),/duplicate/);
});
test("row truncation, explicit clears, duplicate refs, malformed quotes and formulas cannot become defaults", () => {
  assert.ok(parseSource("workforce","email,firstName,lastName\na@example.com,Name\n","a.csv").rows[0]!.errors.some(e => /length/.test(e)));
  assert.ok(parseSource("workforce","email,phone\na@example.com,__CLEAR__\n","a.csv").rows[0]!.errors.some(e => /clear/.test(e)));
  assert.ok(parseSource("workforce","rowRef,email\nx,a@example.com\nx,b@example.com\n","a.csv").rows.every(r => r.errors.length));
  assert.throws(() => parseSource("workforce",'email,firstName\na@example.com,"unclosed\n',"a.csv"),(error: unknown) => error instanceof ImportError && /unclosed/.test(error.message));
  assert.ok(parseSource("workforce","email,firstName\na@example.com,=HYPERLINK(1)\n","a.csv").rows[0]!.errors.length);
  assert.match(safeCsvCell("=cmd()"),/^"'/); assert.equal(safeCsvCell('a"b'),'"a""b"');
});
test("bounds apply to UTF-8 bytes and actual dataset row counts", () => {
  assert.throws(() => parseSource("workforce","email\n"+"é".repeat(1_000_001),"too-big.csv"),/2 MB/);
  assert.throws(() => parseSource("workforce","email\n"+"a@example.com\n".repeat(501),"too-many.csv"),/500/);
  assert.throws(() => parseSource("employee_departments","email,department\n"+"a@example.com,PLANT\n".repeat(2001),"too-many.csv"),/2,000/);
});
test("purpose-separated review signatures bind source, actor, Facility, scope, mode/version and digest", () => {
  process.env.AUTH_SECRET ||= "onb04-hermetic-secret";
  const review = newReview({ facilityId: "facility", dataset: "workforce", scopeDepartmentId: null, sourceHash: "bytes", fileName: "source.csv", planDigest: hash({ intent: "create" }), actorDigest: hash({ kind: "user", id: "actor" }) });
  const token = signReview(review); assert.deepEqual(readReview(token),review); assert.equal(review.expiresAt-review.issuedAt,30*60_000);
  const [body,sig]=token.split("."); const tampered=JSON.parse(Buffer.from(body!,"base64url").toString());tampered.facilityId="other";
  assert.throws(() => readReview(`${Buffer.from(JSON.stringify(tampered)).toString("base64url")}.${sig}`),/Invalid/);
  assert.throws(() => readReview("other-purpose."+sig),/Invalid/);
});
test("User and Console stay distinct; Quick PIN, partner and changed Facility claims are denied", () => {
  const s={ uid: "actor", facilityId: "f", authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", role: "FACILITY_ADMINISTRATOR", sessionVersion: 0 } as FacilitySession;
  assert.doesNotThrow(() => requireImportSession(s,"f"));
  assert.doesNotThrow(() => requireImportSession({ ...s,authKind: "harbor_staff" },"f"));
  for (const patch of [{ authMethod: "QUICK_PIN" },{ authKind: "employee" },{ accessKind: "partner" },{ role: "MANAGER" },{ scopeKind: "account" }]) assert.throws(() => requireImportSession({ ...s,...patch } as FacilitySession,"f"));
  assert.throws(() => requireImportSession(s,"other"),/Facility changed/);
});
test("planners block unauthorized installations and foreign physical/employee IDs without creating dependencies", () => {
  const catalog={ facility: { id: "f",organizationId: "org" }, departments: [], employees: [], users: [], teams: [], jobRoles: [], jobTitles: [], units: [], spaces: [], unitResponsibilities: [], spaceResponsibilities: [], roles: [{ key: "STAFF" }], assets: null,assetAuthority: {} } as unknown as Catalog;
  for (const [dataset,csv] of [
    ["workforce","email,firstName,lastName,roleType,employmentType,primaryDepartment\na@example.com,Casey,Person,STAFF,FULL_TIME,PLANT\n"],
    ["employee_departments","employeeId,department,membership\nforeign,PLANT,ADDITIONAL\n"],
    ["department_locations","department,locationType,locationId\nPLANT,ROOM,foreign\n"],
  ] as const) {
    const source=parseSource(dataset,csv,"source.csv"), snapshot=JSON.stringify(catalog);
    const plan=planImport(source,catalog,null,new Date("2026-10-17")); assert.equal(plan[0]!.action,"blocked"); assert.equal(plan[0]!.operation,null); assert.equal(JSON.stringify(catalog),snapshot);
  }
});
