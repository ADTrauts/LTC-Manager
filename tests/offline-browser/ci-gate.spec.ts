import { test, expect, type Page } from '@playwright/test';
import { loadFixtures, prisma, loginPassword, signOut, setNetworkOffline, waitForServiceWorkerControl } from './helpers';
import { prepareCanonicalOfflineEntry, openCanonicalSpaceWork, expectCanonicalOfflinePreparation } from './canonical-journey';
const date = (tz: string) => new Date().toLocaleDateString('en-CA', { timeZone: tz });
const index = (project: string) => project === 'tablet' ? 1 : 0;
async function prepare(page: Page) { const fx = loadFixtures(); await prepareCanonicalOfflineEntry(page, fx.canonical, fx.adminEmail, date(fx.facilityTimezone)); await waitForServiceWorkerControl(page); return fx; }
async function cached(page: Page) { return page.evaluate(async () => { const s = await import(/* webpackIgnore: true */ String('/space-offline-store.js')); const row = (await s.envelopes()).find((r: {id:string;commands:unknown[]}) => r.id === s.activeId()); return { ...await s.read(row), id: row.id }; }); }
async function sync(page: Page) { await page.getByTestId('space-offline-sync').click(); }
test('scenario-02/04 @ci-gate: public code caches; protected HTML, RSC and API responses never cache', async ({ page }) => {
    const fx = await prepare(page);
    await page.goto(`/unit/${fx.canonical.unitId}?space=${fx.canonical.spaceId}`);
    await page.evaluate(() => fetch('/api/offline/runtime-bundle', {cache:'no-store'}));
    const urls = await page.evaluate(async () => { const urls: string[] = []; for (const name of await caches.keys())
        for (const request of await (await caches.open(name)).keys())
            urls.push(request.url); return urls; });
    expect(urls.some(u => u.endsWith('/offline.html'))).toBe(true);
    expect(urls.some(u => u.endsWith('/space-offline-store.js'))).toBe(true);
    expect(urls.filter(u => { const p = new URL(u); return p.pathname.startsWith('/api/') || p.pathname.startsWith('/unit/') || p.pathname === '/login' || p.searchParams.has('_rsc'); })).toEqual([]);
});
test('scenario-03/30 @ci-gate: genuine offline shell with no prepared context exposes no operational data', async ({ page, context }) => {
    const fx = await prepare(page);
    await page.getByTestId('space-offline-lock').click();
    await setNetworkOffline(context, true, page);
    await page.reload();
    await expect(page.getByTestId('space-offline-status')).toContainText('No unlocked');
    await expect(page.getByTestId('space-work-complete')).toHaveCount(0);
    await expect(page.getByTestId('space-key-time-actual')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(fx.canonical.workLabel);
});
test('scenario-05 @ci-gate: exact Space encrypts IndexedDB; a new tab cannot retrieve its key', async ({ page, context }) => {
    await prepare(page);
    const data = await cached(page);
    expect(data.bundle.scope.spaceId).toBe(loadFixtures().canonical.spaceId);
    const denied = await page.request.post('/api/offline/runtime-bundle', { headers: { origin: 'https://unapproved.example.test', cookie: (await context.cookies()).map(c => `${c.name}=${c.value}`).join('; ') }, data: {protocol:'space/1', action:'prepare', scope:data.bundle.scope} }); expect(denied.status()).toBe(403);
    const raw = await page.evaluate(async () => { const s = await import(String('/space-offline-store.js')); return JSON.stringify(await s.envelopes()); });
    expect(raw).not.toContain(data.bundle.label);
    expect(raw).not.toContain(loadFixtures().canonical.workLabel);
    expect(raw).not.toContain('password');
    // Ciphertext is random Base64 and may contain the letters "jwt". Check
    // credential fields and JWT structure, never a three-character substring.
    expect(raw).not.toMatch(/"jwt"\s*:/i);
    expect(raw).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(raw).not.toContain('pinDigest');
    const second = await context.newPage();
    await second.goto(page.url());
    await expect(second.getByTestId('space-offline-status')).toContainText('No unlocked');
    expect(await second.evaluate(() => Object.keys(sessionStorage).some(k => k.startsWith('vssyl-space/1/') && k.includes('context')))).toBe(false);
    await second.close();
});
test('scenario-07/08/09/11/12/13 @ci-gate: real offline reload, Work/actual queue and interrupted response reconcile exactly once', async ({ page, context }, info) => {
    await prepare(page); const i = index(info.project.name), db = prisma();
    try {
        await setNetworkOffline(context, true, page);
        await page.reload();
        await expect(page.getByTestId('space-offline-status')).toContainText('Offline — prepared');
        await expect(page.getByTestId('space-work-instructions').first()).toHaveText('Verify supplies for this exact Space before confirming completion.');
        await page.locator(`[data-testid="space-work-complete"][data-target-order="${i}"]`).click();
        await page.locator(`[data-testid="space-key-time-actual"][data-target-order="${i}"]`).click();
        await expect(page.getByTestId('space-command-result')).toHaveCount(2);
        await page.reload();
        const queued = await cached(page);
        expect(queued.commands.every((c: {status:string}) => c.status === 'pending')).toBe(true);
        expect(await db.offlineSyncReceipt.count({ where: { issuanceId: queued.id } })).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({ path: info.outputPath('space-offline.png'), fullPage: true });
        await setNetworkOffline(context, false, page);
        // The real request commits, then its browser response is lost. Never mint replacement IDs.
        await page.evaluate(() => { const original = window.fetch; let lose = true; window.fetch = async (...args) => { const response = await original(...args); if (lose && String(args[0]).includes('runtime-sync') && String(args[1]?.body).includes('"action":"sync"')) {
            lose = false;
            await response.text();
            throw Error('synthetic lost response after server COMMIT');
        } return response; }; });
        await sync(page);
        await expect(page.getByTestId('space-offline-status')).toContainText('synthetic lost response');
        await sync(page);
        await expect.poll(async () => (await cached(page)).commands.map((c: {status:string}) => c.status)).toEqual(['committed', 'committed']);
        await sync(page);
        const receipts = await db.offlineSyncReceipt.findMany({ where: { issuanceId: queued.id } });
        expect(receipts).toHaveLength(2);
        expect(receipts.every(r => r.intentDigest && r.authoritativeRecordId && r.outcome)).toBe(true);
        for (const c of queued.commands) {
            expect(receipts.filter(r => r.clientCommandId === c.id)).toHaveLength(1);
            if (c.kind === 'WORK')
                expect(await db.departmentWorkEvent.count({ where: { occurrenceId: receipts.find(r => r.clientCommandId === c.id)!.authoritativeRecordId!, eventType: 'COMPLETED' } })).toBe(1);
            else {
                const k = await db.operationalCycleKeyTimeDayExpectation.findUniqueOrThrow({ where: { id: c.target } });
                expect(await db.operationalCycleKeyPointActual.count({ where: { cycleId: k.cycleId, spaceId: k.spaceId, serviceDate: k.serviceDate } })).toBe(1);
            }
        }
        await expect(page.getByTestId('space-online-only')).toContainText('corrections and expected-time adjustments are unavailable offline');
    }
    finally {
        await db.$disconnect();
    }
});
test('scenario-conflict @ci-gate: another authorized actor records the actual; replay shows conflict without correction', async ({ page, context, browser }, info) => {
    const fx = await prepare(page), i = 2 + index(info.project.name);
    await setNetworkOffline(context, true, page);
    await page.reload();
    await page.locator(`[data-testid="space-key-time-actual"][data-target-order="${i}"]`).click();
    await page.locator(`[data-testid="space-work-complete"][data-target-order="${10 + index(info.project.name)}"]`).click();
    const other = await browser.newContext({ baseURL: process.env.OFFLINE_BROWSER_BASE_URL, serviceWorkers: 'allow' });
    try {
        const p = await other.newPage();
        await prepareCanonicalOfflineEntry(p, fx.canonical, fx.adminEmail, date(fx.facilityTimezone));
        await openCanonicalSpaceWork(p, fx.canonical, fx.canonical.people.secondWorker.email);
        await expectCanonicalOfflinePreparation(p);
        await p.locator(`[data-testid="space-key-time-actual"][data-target-order="${i}"]`).click();
        await sync(p);
        await expect(p.getByTestId('space-command-result')).toContainText('committed');
        await setNetworkOffline(context, false, page);
        await sync(page);
        await expect(page.getByTestId('space-command-result').filter({hasText:'conflict'})).toHaveCount(1);
        await expect(page.getByTestId('space-command-result').filter({hasText:'committed'})).toHaveCount(1);
        await expect(page.getByTestId('space-command-result').filter({hasText:'conflict'})).toContainText('Corrections are online-only');
        const data = await cached(page), db = prisma();
        try {
            expect(await db.offlineConflict.count({ where: { clientCommandId: data.commands.find((c:{kind:string})=>c.kind==='KEY_TIME_ACTUAL').id } })).toBe(1);
            const receipts=await db.offlineSyncReceipt.findMany({where:{issuanceId:data.id}}); expect(receipts).toHaveLength(2);
            await sync(page); expect(await db.offlineSyncReceipt.count({where:{issuanceId:data.id}})).toBe(2);
            const work=receipts.find(r=>r.commandType==='space/1:WORK')!;expect(await db.departmentWorkEvent.count({where:{occurrenceId:work.authoritativeRecordId!,eventType:'COMPLETED'}})).toBe(1);
        }
        finally {
            await db.$disconnect();
        }
    }
    finally {
        await other.close();
    }
});
test('scenario-27 @ci-gate: sign-out seals pending intent; other actor denied; fresh same-actor review recovers', async ({ page, context }, info) => {
    const fx = await prepare(page);
    await page.locator(`[data-testid="space-work-complete"][data-target-order="${4 + index(info.project.name)}"]`).click();
    const before = await cached(page);
    await signOut(page);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('vssyl-space/1/') && k !== 'vssyl-space/1/identity'))).toEqual([]);
    await openCanonicalSpaceWork(page, fx.canonical, fx.canonical.people.secondWorker.email);
    await expect(page.getByTestId('space-offline-status')).toContainText('No unlocked');
    await page.getByTestId('space-offline-recovery').click();
    await expect(page.getByTestId('space-recover-issuance')).toHaveCount(0);
    const denied = await page.request.post('/api/offline/runtime-bundle', { headers: { cookie: (await context.cookies()).map(c => `${c.name}=${c.value}`).join('; ') }, data: { protocol: 'space/1', action: 'recover', issuanceId: before.id, digest: before.bundle.reviewDigest, review: true } });
    expect(denied.status()).toBe(403);
    await openCanonicalSpaceWork(page, fx.canonical);
    await page.getByTestId('space-offline-recovery').click();
    await page.getByTestId('space-recover-issuance').filter({ hasText: before.id }).click();
    await expect(page.getByTestId('space-offline-status')).toContainText('intent review only');
    await expect(page.getByTestId('space-work-complete')).toHaveCount(0);
    expect((await cached(page)).commands[0].id).toBe(before.commands[0].id);
    await sync(page); await expect.poll(async () => (await cached(page)).commands[0].status).toBe('committed');
});
test('scenario-expiry/scope @ci-gate: expiry hides data and preserves ciphertext; wrong Space cannot reopen it', async ({ page, context }, info) => {
    const fx = await prepare(page);
    await page.locator(`[data-testid="space-work-complete"][data-target-order="${6 + index(info.project.name)}"]`).click();
    const before = await cached(page);
    await page.clock.install({ time: Date.now() });
    await page.clock.setSystemTime(Date.now() + 13 * 3600000);
    await page.clock.runFor(1100);
    await expect(page.getByTestId('space-offline-status')).toContainText('expired');
    await expect(page.getByTestId('space-work-complete')).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('vssyl-space/1/') && k !== 'vssyl-space/1/identity'))).toEqual([]);
    const intact = await page.evaluate(async (id) => { const s = await import(String('/space-offline-store.js')); return (await s.envelopes()).find((r: {id:string;commands:unknown[]}) => r.id === id).commands.length; }, before.id);
    expect(intact).toBe(1);
    await page.clock.setSystemTime(Date.now());
    await setNetworkOffline(context, true, page);
    await page.goto(`/unit/${fx.canonical.unitId}?space=other`);
    await expect(page.getByTestId('space-work-complete')).toHaveCount(0);
});

test('scenario-capacity @ci-gate: preparation bound refuses overflow and explicit safe cleanup preserves pending intent',async({page})=>{
 await prepare(page);
 for(let i=1;i<8;i++)await expectCanonicalOfflinePreparation(page);
 await page.getByTestId('space-offline-prepare').click();await expect(page.getByTestId('space-offline-status')).toContainText('storage limit reached');
 await page.locator(`[data-testid="space-work-complete"][data-target-order="${8}"]`).click();const before=await cached(page);
 await page.getByTestId('space-offline-prune').click();
 const remaining=await page.evaluate(async()=>{const s=await import(String('/space-offline-store.js'));return(await s.envelopes()).map((r:{id:string;commands:unknown[]})=>({id:r.id,commands:r.commands.length}));});
 expect(remaining).toEqual([{id:before.id,commands:1}]);
});

test('scenario-unbind @ci-gate: full unbind discloses sealed pending loss; cancel preserves intent',async({page})=>{
 const fx=await prepare(page);await page.locator('[data-testid="space-work-complete"][data-target-order="9"]').click();const before=await cached(page);
 await loginPassword(page,fx.adminEmail);await page.getByTestId('account-menu-trigger').click();
 const dialog=page.waitForEvent('dialog');await page.getByTestId('account-menu-unbind').click({noWaitAfter:true});const confirm=await dialog;
 expect(confirm.type()).toBe('confirm');expect(confirm.message()).toContain('1 pending offline actions');await confirm.dismiss();
 const count=await page.evaluate(async()=>{const s=await import(String('/space-offline-store.js'));return(await s.envelopes()).flatMap((r:{commands:unknown[]})=>r.commands).length;});expect(count).toBe(1);
 expect(before.commands[0].status).toBe('pending');
});
