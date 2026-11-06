import assert from "node:assert/strict";
import test from "node:test";
import type { FacilitySession } from "@/lib/auth";
import { EMPLOYEE_CSV_TEMPLATE, parseEmployeeUpdateCsv } from "@/lib/employee-csv-import";
import { confirmEmployeeCsv, previewEmployeeCsv, requireEmployeeCsvAuthority } from "./service";

const session = { uid: "actor", facilityId: "facility", role: "MANAGER", authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", sessionVersion: 0, name: "Manager", email: "manager@example.com" } as FacilitySession;

test("names-only and fully blank optional cells produce patches without defaults", () => {
  assert.deepEqual(parseEmployeeUpdateCsv("firstName,lastName\nJane,Doe")[0]!.values, { firstName: "Jane", lastName: "Doe" });
  assert.deepEqual(parseEmployeeUpdateCsv("employeeId,email,roleType,status,workStations\nemp_1, ,,,")[0]!.values, { employeeId: "emp_1" });
  assert.equal(EMPLOYEE_CSV_TEMPLATE.trim().split("\n").length, 1);
});

test("clear is distinct from blank, and explicit false remains false", () => {
  assert.deepEqual(parseEmployeeUpdateCsv("employeeId,phone,workStations,onLeave\nemp_1,__CLEAR__,__CLEAR__,false")[0]!.values, { employeeId: "emp_1", phone: null, workStations: [], onLeave: false });
});

for (const [field, input] of [
  ["status", "__CLEAR__"], ["roleType", "__CLEAR__"], ["firstName", "__CLEAR__"], ["employmentType", "__CLEAR__"],
  ["terminationDate", "__CLEAR__"], ["chrcOffboardingNotes", "__CLEAR__"], ["unionMember", "perhaps"],
  ["hireDate", "2026-02-30"], ["chrcClearedAt", "2026-13-02"], ["workStations", "COOK|NOT_A_STATION"],
  ["birthMonth", "13"], ["birthDay", "zero"], ["roleType", "OWNER"], ["status", "LIVE"],
] as const) test(`blocks invalid ${field}: ${input}`, () => {
  assert.ok(parseEmployeeUpdateCsv(`employeeId,${field}\nemp_1,${input}`)[0]!.errors.length);
});

for (const header of ["employeeId,employee_id", "employeeId,password", "employeeId,pinDigest", "employeeId,userId", "employeeId,constructor", "employeeId,"])
  test(`rejects unsupported or duplicate headers: ${header}`, () => assert.throws(() => parseEmployeeUpdateCsv(`${header}\na,b`)));

test("row shape and multiline quoted values retain source provenance", () => {
  const rows = parseEmployeeUpdateCsv('employeeId,hrNotes\n\nemp_1,"first line\nsecond, line"\nemp_2,short,extra\nemp_3');
  assert.equal(rows[0]!.row, 3);
  assert.equal(rows[0]!.values.hrNotes, "first line\nsecond, line");
  assert.deepEqual(rows[0]!.columns.hrNotes, { column: 2, header: "hrNotes" });
  assert.equal(rows[1]!.row, 5);
  assert.equal(rows[1]!.errors.length, 1);
  assert.equal(rows[2]!.errors.length, 1);
});

test("malformed quoting, excessive rows and oversized field values fail without truncation", () => {
  assert.throws(() => parseEmployeeUpdateCsv('employeeId,hrNotes\nemp_1,"unclosed'), /unclosed/);
  assert.throws(() => parseEmployeeUpdateCsv('employeeId,hrNotes\nemp_1,"closed"garbage'), /malformed/);
  assert.throws(() => parseEmployeeUpdateCsv('employeeId\n' + Array.from({ length: 501 }, (_, i) => `emp_${i}`).join('\n')), /Too many rows/);
  assert.ok(parseEmployeeUpdateCsv(`employeeId,firstName\nemp_1,${"a".repeat(61)}`)[0]!.errors.length);
});

for (const overrides of [
  { authKind: "harbor_staff" }, { authKind: "employee", authMethod: "QUICK_PIN" }, { authMethod: "QUICK_PIN" },
  { authMethod: undefined }, { role: "STAFF" }, { scopeKind: "organization" }, { sessionVersion: undefined },
]) test(`credential boundary rejects ${JSON.stringify(overrides)} before reading or writing`, async () => {
  const denied = { ...session, ...overrides } as FacilitySession;
  assert.throws(() => requireEmployeeCsvAuthority(denied));
  const db = new Proxy({}, { get() { throw new Error("Database must not be accessed"); } }) as never;
  await assert.rejects(() => previewEmployeeCsv(db, denied, { text: "employeeId\nemp_1", fileName: "file.csv" }, "test-secret"), /password|permissions/);
  await assert.rejects(() => confirmEmployeeCsv(db, denied, { text: "employeeId\nemp_1", fileName: "file.csv" }, "", "test-secret"), /password|permissions/);
});
