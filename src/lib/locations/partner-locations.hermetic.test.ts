import assert from "node:assert/strict";
import test from "node:test";

import { projectPartnerLocations } from "@/lib/locations/load-partner-locations";
import { canPartner, PARTNER_CAPABILITIES } from "@/lib/partner-user-access";
import { partnerShellReturnPath } from "@/lib/partner-operational-context";

const terrace = "terrace";
const food = "food";
const evs = "evs";
const plant = "plant";

function unit(
  id: string,
  name: string,
  role: string | null,
  parentUnitId: string | null,
  facilityId = terrace,
) {
  return {
    id,
    facilityId,
    name,
    parentUnitId,
    hierarchyRole: role,
    displayOrder: 1,
    isActive: true,
  };
}

function room(
  id: string,
  name: string,
  unitId: string,
  facilityId = terrace,
) {
  return {
    id,
    facilityId,
    name,
    roomNumber: null,
    spaceType: "SERVICE",
    unitId,
    isActive: true,
    sortOrder: 1,
  };
}

function labels(nodes: { label: string; presentation: string; children: { label: string; presentation: string; children: unknown[] }[] }[]): string[] {
  const out: string[] = [];
  const visit = (node: { label: string; presentation: string; children: typeof nodes }) => {
    out.push(`${node.presentation}:${node.label}`);
    for (const child of node.children) visit(child as never);
  };
  for (const node of nodes) visit(node as never);
  return out;
}

const floor = unit("floor1", "Floor 1", "FLOOR", null);
const naval = unit("naval", "Naval Park", "NEIGHBORHOOD", "floor1");
const lighthouse = unit("lighthouse", "Lighthouse", "NEIGHBORHOOD", "floor1");
const servery = room("servery", "Servery", "naval");
const resident = room("room101", "Resident Room 101", "naval");
const closet = room("closet", "EVS Closet", "lighthouse");

test("partner locations capability is read-only", () => {
  for (const role of ["PARTNER_VIEWER", "PARTNER_OPERATOR", "PARTNER_MANAGER"] as const) {
    assert.equal(canPartner(role, "locations.read"), true);
  }
  assert.equal(PARTNER_CAPABILITIES.includes("locations.manage" as never), false);
  assert.equal(partnerShellReturnPath("/partner/locations"), "/partner/locations");
  assert.equal(partnerShellReturnPath("/units"), "/partner");
});

test("unit responsibility does not reveal unauthorized rooms", () => {
  const view = projectPartnerLocations({
    facilityId: terrace,
    departmentId: food,
    departmentKey: "DIETARY",
    departmentName: "Food & Nutrition",
    units: [floor, naval, lighthouse],
    rooms: [servery, resident, closet],
    responsibleUnitIds: ["naval"],
    responsibleRoomIds: ["servery"],
  });
  assert.deepEqual(labels(view.roots), [
    "STRUCTURAL:Floor 1",
    "ACTIONABLE:Naval Park",
    "ACTIONABLE:Servery",
  ]);
});

test("authorized room under an unauthorized neighborhood stays structural", () => {
  const neighborhood = unit("neigh-a", "Neighborhood A", "NEIGHBORHOOD", "floor1");
  const office = room("office", "Diet Office", "neigh-a");
  const view = projectPartnerLocations({
    facilityId: terrace,
    departmentId: food,
    departmentKey: "DIETARY",
    departmentName: "Food & Nutrition",
    units: [floor, neighborhood, lighthouse],
    rooms: [office, closet],
    responsibleUnitIds: [],
    responsibleRoomIds: ["office"],
  });
  assert.deepEqual(labels(view.roots), [
    "STRUCTURAL:Floor 1",
    "STRUCTURAL:Neighborhood A",
    "ACTIONABLE:Diet Office",
  ]);
});

test("empty responsible neighborhood remains actionable", () => {
  const view = projectPartnerLocations({
    facilityId: terrace,
    departmentId: food,
    departmentKey: "DIETARY",
    departmentName: "Food & Nutrition",
    units: [floor, naval, lighthouse],
    rooms: [resident],
    responsibleUnitIds: ["naval"],
    responsibleRoomIds: [],
  });
  assert.deepEqual(labels(view.roots), ["STRUCTURAL:Floor 1", "ACTIONABLE:Naval Park"]);
});

test("department switch drops the previous department tree", () => {
  const shared = {
    facilityId: terrace,
    units: [floor, naval, lighthouse],
    rooms: [servery, closet],
  };
  const foodView = projectPartnerLocations({
    ...shared,
    departmentId: food,
    departmentKey: "DIETARY",
    departmentName: "Food & Nutrition",
    responsibleUnitIds: ["naval"],
    responsibleRoomIds: ["servery"],
  });
  const evsView = projectPartnerLocations({
    ...shared,
    departmentId: evs,
    departmentKey: "EVS",
    departmentName: "EVS",
    responsibleUnitIds: ["lighthouse"],
    responsibleRoomIds: ["closet"],
  });
  assert.equal(labels(foodView.roots).some((row) => row.includes("Servery")), true);
  assert.equal(labels(foodView.roots).some((row) => row.includes("EVS Closet")), false);
  assert.equal(labels(evsView.roots).some((row) => row.includes("EVS Closet")), true);
  assert.equal(labels(evsView.roots).some((row) => row.includes("Servery")), false);
});

test("shared room is visible to each responsible department without the other room", () => {
  const sharedRoom = room("shared", "Shared Servery", "naval");
  const base = {
    facilityId: terrace,
    units: [floor, naval],
    rooms: [sharedRoom, resident],
    responsibleUnitIds: [] as string[],
  };
  const foodView = projectPartnerLocations({
    ...base,
    departmentId: food,
    departmentKey: "DIETARY",
    departmentName: "Food & Nutrition",
    responsibleRoomIds: ["shared"],
  });
  const evsView = projectPartnerLocations({
    ...base,
    departmentId: evs,
    departmentKey: "EVS",
    departmentName: "EVS",
    responsibleRoomIds: ["shared"],
  });
  assert.deepEqual(labels(foodView.roots), [
    "STRUCTURAL:Floor 1",
    "STRUCTURAL:Naval Park",
    "ACTIONABLE:Shared Servery",
  ]);
  assert.deepEqual(labels(evsView.roots), labels(foodView.roots).map((row) => row));
});

test("partner plant rooms require explicit responsibility", () => {
  const roomA = room("plant-a", "Room A", "naval");
  const roomB = room("plant-b", "Room B", "naval");
  const view = projectPartnerLocations({
    facilityId: terrace,
    departmentId: plant,
    departmentKey: "PLANT",
    departmentName: "Plant",
    units: [floor, naval],
    rooms: [roomA, roomB],
    responsibleUnitIds: [],
    responsibleRoomIds: ["plant-a"],
  });
  const text = labels(view.roots).join("\n");
  assert.match(text, /Room A/);
  assert.doesNotMatch(text, /Room B/);
});

test("cross-facility rooms are absent", () => {
  const foreign = room("hp-servery", "HighPointe Servery", "naval", "highpointe");
  const view = projectPartnerLocations({
    facilityId: terrace,
    departmentId: food,
    departmentKey: "DIETARY",
    departmentName: "Food & Nutrition",
    units: [floor, naval, unit("hp-floor", "HP Floor", "FLOOR", null, "highpointe")],
    rooms: [servery, foreign],
    responsibleUnitIds: [],
    responsibleRoomIds: ["servery", "hp-servery"],
  });
  const text = labels(view.roots).join("\n");
  assert.match(text, /Servery/);
  assert.doesNotMatch(text, /HighPointe/);
});

test("blank department fails closed", () => {
  assert.throws(
    () =>
      projectPartnerLocations({
        facilityId: terrace,
        departmentId: " ",
        departmentKey: "DIETARY",
        departmentName: "Food & Nutrition",
        units: [],
        rooms: [],
        responsibleUnitIds: [],
        responsibleRoomIds: [],
      }),
    /one Department/,
  );
});

test("no assignments produce an empty tree", () => {
  const view = projectPartnerLocations({
    facilityId: terrace,
    departmentId: food,
    departmentKey: "DIETARY",
    departmentName: "Food & Nutrition",
    units: [floor, naval, lighthouse],
    rooms: [servery, resident, closet],
    responsibleUnitIds: [],
    responsibleRoomIds: [],
  });
  assert.deepEqual(view.roots, []);
});
