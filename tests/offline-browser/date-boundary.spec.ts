import { test, expect } from '@playwright/test';
import { loadFixtures, prisma, ensureDeviceBoundAsAdmin, loginPassword, setNetworkOffline, waitForServiceWorkerControl } from './helpers';
import { prepareCanonicalResponsibility, openCanonicalSpaceWork, expectCanonicalOfflinePreparation } from './canonical-journey';

// Real server/authentication/issuance + public offline renderer. Move only the
// browser clock; backend authority, credentials and recovery proofs stay real.
for (const restore of ['idle', 'focus', 'visibilitychange'] as const) {
  test(`Facility date boundary @ci-gate: ${restore}, ciphertext retention and fresh online review`, async ({ page, context }, info) => {
    await page.addInitScript(() => {
      // Playwright clock methods replace Performance as well as Date in this
      // version. Mock Date alone so genuine navigation and native timers survive.
      const NativeDate = Date;
      const now = () => { const t = sessionStorage.getItem('date-test-clock'); return t === null ? NativeDate.now() : Number(t); };
      window.Date = new Proxy(NativeDate, {
        construct: (target, args) => Reflect.construct(target, args.length ? args : [now()]),
        apply: () => new NativeDate(now()).toString(),
        get: (target, property) => property === 'now' ? now : Reflect.get(target, property),
      });
      const events: unknown[] = []; Object.assign(window, { dateLockEvents: events });
      window.addEventListener('space-offline-locked', event => events.push({ at: new Date().toISOString(), monotonic: performance.now(), reason: (event as CustomEvent).detail, navigation: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type }));
    });
    const fx = loadFixtures(), db = prisma();
    const original = await db.facility.findUniqueOrThrow({ where: { id: fx.facilityId } });
    // Keep this release regression runnable at any time of day: choose a real,
    // non-UTC Facility timezone whose next midnight fits the normal 12h lease.
    const timezone = ['America/New_York', 'Pacific/Auckland', 'Asia/Kolkata', 'Pacific/Honolulu']
      .find(tz => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date())) >= 13)!;
    expect(timezone).toBeTruthy();
    const serviceDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    // Find the actual next local date boundary; no application date contract is
    // reimplemented here. The production guard still owns its Intl date check.
    let midnight = Math.ceil(Date.now() / 60000) * 60000;
    while (new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(midnight)) === serviceDate) midnight += 60000;
    try {
      await db.facility.update({ where: { id: fx.facilityId }, data: { timezone } });
      await prepareCanonicalResponsibility(page, fx.canonical, serviceDate);
      await ensureDeviceBoundAsAdmin(page, fx.adminEmail, fx.canonical.unitId);
      await openCanonicalSpaceWork(page, fx.canonical);
      await waitForServiceWorkerControl(page);
      await page.evaluate(time => sessionStorage.setItem('date-test-clock', String(time)), midnight - 10000);
      await expectCanonicalOfflinePreparation(page);
      const prepared = await page.evaluate(async () => {
        const s = await import(String('/space-offline-store.js')), r = (await s.envelopes()).find((r: {id:string}) => r.id === s.activeId());
        return { id: r.id, meta: r.meta, label: (await s.read(r)).bundle.label };
      });
      expect(prepared.meta.timezone).toBe(timezone);
      expect(prepared.meta.operationalDate).toBe(serviceDate);
      expect(Date.parse(prepared.meta.expiresAt)).toBeGreaterThan(midnight);
      await setNetworkOffline(context, true, page);
      await page.reload();
      await expect(page.getByTestId('space-offline-status')).toContainText('Offline — prepared');
      // Normal pre-boundary control and a real offline mutation (not a mocked
      // transport/store write). Exactly one pending command must survive.
      // Target 12 is unused by the earlier required conflict/replay journeys.
      // Boundary review never submits it, so all three cases remain independent.
      await page.locator('[data-testid="space-work-complete"][data-target-order="12"]').click();
      const sealed = await page.evaluate(async id => {
        const s = await import(String('/space-offline-store.js')); return (await s.envelopes()).find((r: {id:string}) => r.id === id);
      }, prepared.id);
      expect(sealed.commands).toHaveLength(1);
      expect(JSON.stringify(sealed)).not.toContain('Verify supplies');
      await page.waitForTimeout(1000);
      await expect(page.getByTestId('space-work-instructions').first()).toBeVisible();
      const boundaryStarted = await page.evaluate(() => performance.now());
      await page.evaluate(time => sessionStorage.setItem('date-test-clock', String(time)), midnight);
      if (restore !== 'idle') await page.evaluate(event => {
        if (event === 'visibilitychange') {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
          document.dispatchEvent(new Event(event));
        } else window.dispatchEvent(new Event(event));
      }, restore);
      await expect(page.getByTestId('space-offline-status')).toContainText('expired', { timeout: 1500 });
      const lockEvents = await page.evaluate(() => (window as unknown as { dateLockEvents: { at: string; monotonic: number; reason: string }[] }).dateLockEvents);
      const expiration = lockEvents.find(e => e.reason.includes('expired'))!;
      expect(expiration).toBeTruthy();
      expect(expiration.monotonic - boundaryStarted).toBeLessThanOrEqual(1100); // 1s timer + scheduling tolerance.
      await info.attach('facility-date-boundary', { body: JSON.stringify({ timezone, operationalDate: serviceDate, midnight: new Date(midnight).toISOString(), expiresAt: prepared.meta.expiresAt, restore, lockDelayMs: expiration.monotonic - boundaryStarted, lockEvents, commandId: sealed.commands[0].id }, null, 2), contentType: 'application/json' });
      await expect(page.getByTestId('space-work-instructions')).toHaveCount(0);
      await expect(page.getByTestId('space-work-complete')).toHaveCount(0);
      await expect(page.getByTestId('space-key-time-actual')).toHaveCount(0);
      await expect(page.getByTestId('space-offline-sync')).toBeHidden();
      await expect(page.getByRole('heading', { name: 'Offline for this Space', exact: true })).toBeVisible();
      await expect(page.locator('body')).not.toContainText(prepared.label);
      const result = await page.evaluate(async id => {
        const s = await import(String('/space-offline-store.js')), r = (await s.envelopes()).find((r: {id:string}) => r.id === id);
        const secrets = Object.keys(sessionStorage).filter(k => k.startsWith(s.PREFIX));
        try { await s.queue(r, { id: 'invalid-new-action', kind: 'WORK' }); return { row: r, secrets, rejected: false }; }
        catch { return { row: r, secrets, rejected: true }; }
      }, prepared.id);
      expect(result.secrets).toEqual([]);
      expect(result.rejected).toBe(true);
      expect(result.row).toEqual(sealed);
      await page.reload();
      await expect(page.getByTestId('space-work-instructions')).toHaveCount(0);
      await setNetworkOffline(context, false, page);
      // Return to the real wall clock for the credential UI. The old issuance
      // remains locked; recovery is explicitly review-only even if its numeric
      // lease has time remaining. No expired instructions may be restored.
      await page.evaluate(() => sessionStorage.removeItem('date-test-clock'));
      await loginPassword(page, fx.canonical.people.worker.email);
      await page.goto(`/unit/${fx.canonical.unitId}?space=${fx.canonical.spaceId}`);
      await page.getByTestId('space-offline-recovery').click();
      await page.getByTestId('space-recover-issuance').filter({ hasText: prepared.id }).click();
      await expect(page.getByTestId('space-offline-status')).toContainText('intent review only');
      await expect(page.getByTestId('space-work-instructions')).toHaveCount(0);
      await expect(page.getByTestId('space-work-complete')).toHaveCount(0);
      await expect(page.getByTestId('space-command-result')).toContainText('pending');
      const recovered = await page.evaluate(async id => {
        const s = await import(String('/space-offline-store.js')), r = (await s.envelopes()).find((r: {id:string}) => r.id === id);
        return { data: await s.read(r, true), commands: r.commands };
      }, prepared.id);
      expect(recovered.data.bundle).toBeNull();
      expect(recovered.commands).toEqual(sealed.commands);
      expect(recovered.data.commands[0].id).toBe(sealed.commands[0].id);
      // One real receipt is not fabricated by merely reviewing local intent.
      expect(await db.offlineSyncReceipt.count({ where: { issuanceId: prepared.id } })).toBe(0);
    } finally {
      await db.facility.update({ where: { id: fx.facilityId }, data: { timezone: original.timezone } });
      await db.$disconnect();
    }
  });
}
