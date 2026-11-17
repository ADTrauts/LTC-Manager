import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";

import { assertDisposableDatabaseUrl } from "../../src/lib/verify/database-target";

const identity = "/api/console/staff-lifecycle/identity";
const lifecycle = "/api/console/staff-lifecycle";
const staffCookie = "harbor_session";
const fixture = { a: "lifecycle-owner-a", b: "lifecycle-owner-b", reviewer: "lifecycle-reviewer" };
type Mail =
  | { kind: "INVITE" | "RECOVERY"; token: string; to: string; intentId: string }
  | { kind: "RECOVERY_COMPLETED"; to: string; intentId: string };
type Options = PublicKeyCredentialCreationOptionsJSON | PublicKeyCredentialRequestOptionsJSON;
type Challenge = { challengeId: string; options: Options };

async function post(page: Page, path: string, body: object) {
  return page.evaluate(async ({ path, body }) => {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  }, { path, body });
}

function respond(page: Page, challenge: Challenge) {
  return page.evaluate(async (options) => {
    const bytes = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const decodeList = (items?: { id: string; type: PublicKeyCredentialType }[]) =>
      items?.map((item) => ({ ...item, id: bytes(item.id) }));
    const result = "user" in options
      ? await navigator.credentials.create({ publicKey: {
        ...options, user: { ...options.user, id: bytes(options.user.id) }, challenge: bytes(options.challenge),
        excludeCredentials: decodeList(options.excludeCredentials),
      } })
      : await navigator.credentials.get({ publicKey: {
        ...options, challenge: bytes(options.challenge), allowCredentials: decodeList(options.allowCredentials),
      } });
    if (!result) throw new Error("The virtual authenticator did not respond.");
    return (result as unknown as { toJSON(): unknown }).toJSON();
  }, challenge.options);
}

async function perform(page: Page, command: object, expected = 200) {
  const begin = await post(page, lifecycle, { operation: "begin", command });
  if (begin.status !== 200) {
    expect(begin.status).toBe(expected);
    return begin.data;
  }
  const response = await respond(page, begin.data);
  const finish = await post(page, lifecycle, { operation: "execute", challengeId: begin.data.challengeId, response });
  expect(finish.status).toBe(expected);
  return finish.data;
}

async function enroll(page: Page, token: string, password: string, name: string) {
  const begin = await post(page, identity, { operation: "begin-enrollment", token });
  expect(begin.status).toBe(200);
  const response = await respond(page, begin.data);
  const finish = await post(page, identity, {
    operation: "finish-enrollment", token, password, displayName: name, challengeId: begin.data.challengeId, response,
  });
  expect(finish.status).toBe(200);
  expect((await post(page, identity, { operation: "begin-enrollment", token })).status).toBe(403);
}

async function signIn(page: Page, email: string, password: string) {
  const start = await post(page, "/api/console/auth/login", { email, password });
  expect(start.status).toBe(200);
  const step = start.data.mfa as Challenge | undefined;
  if (!step) throw new Error("Password sign-in did not require a passkey.");
  const response = await respond(page, step);
  const finish = await post(page, identity, { operation: "sign-in", challengeId: step.challengeId, response });
  expect(finish.status).toBe(200);
  expect((await post(page, identity, { operation: "sign-in", challengeId: step.challengeId, response })).status).toBe(403);
}

test("staff invite, passkey, recovery and authority workflows use application routes", async ({ browser, baseURL }) => {
  const dbUrl = process.env.CONSOLE_BROWSER_DATABASE_URL;
  const mailbox = process.env.HARBOR_LIFECYCLE_TEST_MAILBOX;
  test.skip(!dbUrl || !mailbox, "Requires the synthetic lifecycle application and disposable database.");
  const target = assertDisposableDatabaseUrl(dbUrl);
  if (!baseURL || new URL(baseURL).hostname !== "localhost" || target.host !== "127.0.0.1" || !mailbox) {
    throw new Error("Use the disposable loopback environment.");
  }
  const mailboxUrl = new URL(mailbox);
  if (mailboxUrl.hostname !== "127.0.0.1" || mailboxUrl.protocol !== "http:") throw new Error("Expected loopback fixture mailbox.");
  const delivered: Mail[] = [];
  const sink = createServer((request, response) => {
    let input = "";
    request.on("data", (chunk) => { input += chunk; });
    request.on("end", () => {
      if (request.method !== "POST" || request.url !== mailboxUrl.pathname) { response.writeHead(404).end(); return; }
      delivered.push(JSON.parse(input));
      response.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => sink.listen(Number(mailboxUrl.port), mailboxUrl.hostname, resolve));
  const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext({ baseURL })));
  const [a, b, reviewer, member, separateBrowser] = await Promise.all(contexts.map(async (context) => {
    const page = await context.newPage();
    await page.goto("/console/login", { waitUntil: "domcontentloaded" });
    const client = await context.newCDPSession(page);
    await client.send("WebAuthn.enable");
    await client.send("WebAuthn.addVirtualAuthenticator", { options: {
      protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true,
    } });
    return page;
  }));
  const email = (id: string) => id + "@staff.example.invalid";
  const password = randomUUID();
  const ops = "fixture-security-operator";
  try {
    const fixtureIds = Object.values(fixture);
    await db.platformStaff.deleteMany({ where: { id: { in: fixtureIds } } });
    await db.harborStaffRosterEntry.deleteMany({ where: { email: { in: fixtureIds.map(email) } } });
    const hash = await bcrypt.hash(password, 10);
    for (const id of [fixture.a, fixture.b, fixture.reviewer]) {
      const role = id === fixture.reviewer ? "MEMBER" : "OWNER";
      await db.harborStaffRosterEntry.create({ data: { email: email(id), approvedById: ops } });
      await db.platformStaff.create({ data: { id, email: email(id), displayName: id, role, passwordHash: hash } });
      const token = randomBytes(32).toString("base64url");
      await db.harborStaffLifecycleIntent.create({ data: {
        kind: "BOOTSTRAP", email: email(id), staffId: id, staffVersion: 0, approvedById: ops, proofReference: "CASE-BOOT",
        tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 300000),
      } });
      const page = id === fixture.a ? a : id === fixture.b ? b : reviewer;
      expect((await post(page, "/api/console/auth/login", { email: email(id), password })).status).toBe(403);
      await enroll(page, token, password, id);
      expect((await page.context().cookies()).some(({ name }) => name === staffCookie)).toBe(false);
      await signIn(page, email(id), password);
    }

    // The actual login form completes the password and native passkey ceremonies.
    await a.goto("/console", { waitUntil: "domcontentloaded" });
    await a.getByRole("button", { name: "Sign out", exact: true }).click({ timeout: 15000 });
    await expect(a).toHaveURL(/\/console\/login$/);
    await a.getByLabel("Email").fill(email(fixture.a));
    await a.getByLabel("Password").fill(password);
    await a.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(a).toHaveURL(/\/console$/);

    const memberEmail = email("new-" + randomUUID());
    await perform(a, { action: "invite", email: memberEmail }, 403);
    await perform(reviewer, { action: "approve-roster", email: memberEmail }, 403);
    await perform(b, { action: "approve-roster", email: memberEmail }, 403);
    await perform(a, { action: "approve-roster", email: memberEmail });
    await perform(a, { action: "invite", email: memberEmail });
    expect(await db.platformStaff.findUnique({ where: { email: memberEmail } })).toBeNull();
    const invitation = delivered.find(({ to, kind }) => to === memberEmail && kind === "INVITE");
    if (invitation?.kind !== "INVITE") throw new Error("Expected synthetic work mailbox delivery.");
    await enroll(member, invitation.token, password, "Synthetic member");
    await signIn(member, memberEmail, password);
    const originalMember = await db.platformStaff.findUniqueOrThrow({ where: { email: memberEmail } });
    expect(originalMember.role).toBe("MEMBER");
    await perform(member, { action: "invite", email: memberEmail }, 403);

    // Routine recovery requires both the mailbox token and the browser that proved the old passkey.
    expect((await post(member, identity, { operation: "request-recovery", email: memberEmail })).status).toBe(202);
    const routineRecovery = delivered.find(({ to, kind }) => to === memberEmail && kind === "RECOVERY");
    if (routineRecovery?.kind !== "RECOVERY") throw new Error("Expected a synthetic routine recovery message.");
    const routineToken = routineRecovery.token;
    const factorStart = { operation: "begin-recovery-factor", token: routineToken };
    const factorChallenge = await post(member, identity, factorStart);
    expect(factorChallenge.status).toBe(200);
    expect((await post(separateBrowser, identity, factorStart)).status).toBe(200);
    const factorProof = {
      operation: "prove-recovery-factor", token: routineToken, challengeId: factorChallenge.data.challengeId,
      response: await respond(member, factorChallenge.data),
    };
    expect((await post(separateBrowser, identity, factorProof)).status).toBe(403);
    expect((await post(member, identity, factorProof)).status).toBe(200);
    expect((await post(member, identity, factorProof)).status).toBe(403);

    const enrollmentStart = { operation: "begin-enrollment", token: routineToken };
    expect((await post(separateBrowser, identity, enrollmentStart)).status).toBe(403);
    const enrollment = await post(member, identity, enrollmentStart);
    expect(enrollment.status).toBe(200);
    const memberPassword = randomUUID();
    const finishRoutine = {
      operation: "finish-enrollment", token: routineToken, password: memberPassword,
      challengeId: enrollment.data.challengeId, response: await respond(separateBrowser, enrollment.data),
    };
    expect((await post(separateBrowser, identity, finishRoutine)).status).toBe(403);

    // Advance the proof's age without waiting, keeping the mailbox and registration challenges live.
    const expiredProof = new Date(Date.now() - 6 * 60_000);
    await db.$transaction([
      db.harborStaffLifecycleChallenge.update({ where: { id: factorChallenge.data.challengeId }, data: { usedAt: expiredProof } }),
      db.harborStaffLifecycleIntent.update({ where: { id: routineRecovery.intentId }, data: { selfVerifiedAt: expiredProof } }),
    ]);
    expect((await post(member, identity, finishRoutine)).status).toBe(403);
    expect(await db.platformStaff.findUniqueOrThrow({
      where: { id: originalMember.id }, select: { sessionVersion: true },
    })).toEqual({ sessionVersion: originalMember.sessionVersion });
    const refreshed = await post(member, identity, factorStart);
    expect(refreshed.status).toBe(200);
    expect((await post(member, identity, {
      ...factorProof, challengeId: refreshed.data.challengeId, response: await respond(member, refreshed.data),
    })).status).toBe(200);
    expect((await post(member, identity, finishRoutine)).status).toBe(403);
    await enroll(member, routineToken, memberPassword, "Synthetic member");
    expect(delivered).toContainEqual({ kind: "RECOVERY_COMPLETED", to: memberEmail, intentId: routineRecovery.intentId });
    await member.goto("/console", { waitUntil: "domcontentloaded" });
    await expect(member).toHaveURL(/\/console\/login$/);
    await signIn(member, memberEmail, memberPassword);
    const targetStaff = await db.platformStaff.findUniqueOrThrow({ where: { email: memberEmail } });
    expect(targetStaff.sessionVersion).toBe(originalMember.sessionVersion + 1);

    const command = { action: "change-authority", staffId: targetStaff.id, role: "OWNER", active: true, reason: "ROLE_ASSIGNMENT" };
    const first = (await a.context().cookies()).find(({ name }) => name === staffCookie);
    if (!first) throw new Error("Expected first owner login.");
    const pending = await post(a, lifecycle, { operation: "begin", command });
    expect(pending.status).toBe(200);
    const assertion = await respond(a, pending.data);
    await signIn(a, email(fixture.a), password);
    expect((await post(a, lifecycle, { operation: "execute", challengeId: pending.data.challengeId, response: assertion })).status).toBe(403);
    const expiring = await post(a, lifecycle, { operation: "begin", command });
    expect(expiring.status).toBe(200);
    const expiringAssertion = await respond(a, expiring.data);
    await db.harborStaffLifecycleChallenge.update({ where: { id: expiring.data.challengeId }, data: { expiresAt: new Date(0) } });
    expect((await post(a, lifecycle, { operation: "execute", challengeId: expiring.data.challengeId, response: expiringAssertion })).status).toBe(403);
    const { intentId } = await perform(a, command);
    await perform(a, { action: "approve-owner-change", intentId }, 403);
    await perform(reviewer, { action: "approve-owner-change", intentId }, 403);
    await perform(reviewer, { action: "approve-sole-owner-succession", intentId, proofReference: "CASE-NOT-SOLE" }, 403);
    await perform(b, { action: "approve-owner-change", intentId });
    expect(await db.harborStaffLifecycleAudit.findFirst({ where: { intentId, action: "AUTHORITY_CHANGED" } }))
      .toMatchObject({ actorId: fixture.b, detail: { priorRole: "MEMBER", role: "OWNER", reason: "ROLE_ASSIGNMENT" } });
    const promoted = await db.platformStaff.findUniqueOrThrow({ where: { id: targetStaff.id } });
    expect(promoted.role).toBe("OWNER");
    expect(promoted.sessionVersion).toBe(targetStaff.sessionVersion + 1);
    await member.goto("/console", { waitUntil: "domcontentloaded" });
    await expect(member).toHaveURL(/\/console\/login$/);

    // Arrange the one-owner fixture after exercising the normal dual-approval path.
    await db.platformStaff.updateMany({ where: { id: { in: [fixture.b, targetStaff.id] } },
      data: { isActive: false, sessionVersion: { increment: 1 } } });
    await perform(a, { action: "change-authority", staffId: fixture.a, role: "MEMBER", active: true, reason: "ROLE_ASSIGNMENT" }, 403);
    expect((await post(a, identity, { operation: "request-recovery", email: email(fixture.a) })).status).toBe(202);
    const recovery = delivered.find(({ to, kind }) => to === email(fixture.a) && kind === "RECOVERY");
    if (recovery?.kind !== "RECOVERY") throw new Error("Expected synthetic recovery message.");
    expect((await post(a, identity, { operation: "begin-enrollment", token: recovery.token })).status).toBe(403);
    const factor = await post(a, identity, { operation: "begin-recovery-factor", token: recovery.token });
    expect(factor.status).toBe(200);
    expect((await post(a, identity, {
      operation: "prove-recovery-factor", token: recovery.token, challengeId: factor.data.challengeId,
      response: await respond(a, factor.data),
    })).status).toBe(200);
    expect((await post(a, identity, { operation: "begin-enrollment", token: recovery.token })).status).toBe(403);
    await perform(reviewer, { action: "approve-recovery", intentId: recovery.intentId, proofReference: "CASE-SOLE-OWNER" });
    const newPassword = randomUUID();
    await enroll(a, recovery.token, newPassword, fixture.a);
    expect(delivered).toContainEqual({ kind: "RECOVERY_COMPLETED", to: email(fixture.a), intentId: recovery.intentId });
    for (const cookie of [first, (await a.context().cookies()).find(({ name }) => name === staffCookie)]) {
      if (!cookie) continue;
      await a.context().addCookies([cookie]);
      await a.goto("/console", { waitUntil: "domcontentloaded" });
      await expect(a).toHaveURL(/\/console\/login$/);
    }
    await signIn(a, email(fixture.a), newPassword);
    const events = await db.harborStaffLifecycleAudit.findMany({ where: { intentId: recovery.intentId } });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "RECOVERY_PROOF_APPROVED", actorId: fixture.reviewer }),
      expect.objectContaining({ action: "RECOVERY_COMPLETED", actorId: fixture.a }),
    ]));

    // Prepare an eligible successor; only an independent reviewer's operator case may establish the second OWNER.
    await db.platformStaff.update({ where: { id: targetStaff.id }, data: { role: "MEMBER", isActive: true } });
    await signIn(member, memberEmail, memberPassword);
    const { intentId: successorIntent } = await perform(a, command);
    await perform(a, { action: "approve-sole-owner-succession", intentId: successorIntent, proofReference: "CASE-SELF" }, 403);
    await perform(reviewer, {
      action: "approve-sole-owner-succession", intentId: successorIntent, proofReference: "CASE-SUCCESSION",
    });
    expect(await db.harborStaffLifecycleAudit.findFirst({ where: { intentId: successorIntent, action: "SOLE_OWNER_SUCCESSION_APPROVED" } }))
      .toMatchObject({ actorId: fixture.reviewer, subject: targetStaff.id, detail: { proofReference: "CASE-SUCCESSION" } });
    await member.goto("/console", { waitUntil: "domcontentloaded" });
    await expect(member).toHaveURL(/\/console\/login$/);
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    await db.$disconnect();
    sink.closeAllConnections();
    await new Promise<void>((resolve, reject) => sink.close((error) => error ? reject(error) : resolve()));
  }
});
