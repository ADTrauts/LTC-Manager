import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Hermetic public-renderer regressions. Real authenticated preparation/recovery
// is covered separately in date-boundary.spec.ts, not simulated here.
const origin = 'https://space-date.test';
const before = '2026-10-20T03:59:50Z'; // October 19, 23:59:50 in New York.
const after = '2026-10-20T04:00:00Z';
async function setup(page: Page, prepare = true) {
  await page.route(`${origin}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (['/space-offline.js', '/space-offline-store.js'].includes(path))
      return route.fulfill({ contentType: 'text/javascript', body: readFileSync(`public${path}`, 'utf8') });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main id="probe"></main></body></html>' });
  });
  await page.clock.install({ time: new Date(before) });
  await page.goto(`${origin}/unit/neighborhood?space=space`);
  await page.evaluate(async prepare => {
    const s = await import(String('/space-offline-store.js'));
    const bundle = { protocol: 'space/1', issuanceId: 'date-regression', scope: { facilityId: 'facility', departmentId: 'department', unitId: 'neighborhood', spaceId: 'space' }, actorRef: 'user:worker', sessionVersion: 0, operationalDate: '2026-10-19', issuedAt: new Date().toISOString(), expiresAt: '2026-10-20T06:00:00Z', label: 'Private Space label', timezone: 'America/New_York', reviewDigest: 'd'.repeat(64), targets: [{ kind: 'WORK', id: 'work', label: 'Private Work', instructions: 'Private date-bound instructions', baseline: 'b'.repeat(64), available: true, completed: false }] };
    const prepared = { bundle, key: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))) };
    const root = document.querySelector<HTMLElement>('#probe')!;
    if (prepare) await s.install(prepared);
    else {
      root.dataset.spaceOffline = JSON.stringify({ scope: bundle.scope, actorRef: bundle.actorRef, sessionVersion: bundle.sessionVersion });
      // Hold a successful prepare response across midnight; no active row/timer
      // exists yet. The store must guard final key publication too.
      window.fetch = async () => new Promise(resolve => {
        Object.assign(window, { releasePrepare: () => resolve(new Response(JSON.stringify(prepared), { status: 200 })) });
      });
    }
    const ui = await import(String('/space-offline.js')); await ui.mount(root);
  }, prepare);
}
async function locked(page: Page) {
  await expect(page.getByTestId('space-work-instructions')).toHaveCount(0);
  await expect(page.getByTestId('space-work-complete')).toHaveCount(0);
  await expect(page.getByTestId('space-key-time-actual')).toHaveCount(0);
  await expect(page.getByTestId('space-offline-sync')).toBeHidden();
  await expect(page.locator('h2')).toHaveText('Offline for this Space');
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('vssyl-space/1/')))).toEqual([]);
}

test('date guard @ci-gate: non-UTC pre-boundary control, idle lock and intact encrypted command', async ({ page }) => {
  await setup(page);
  await page.getByTestId('space-work-complete').click();
  const sealed = await page.evaluate(async () => { const s = await import(String('/space-offline-store.js')); return (await s.envelopes())[0]; });
  expect(sealed.commands).toHaveLength(1);
  expect(JSON.stringify(sealed)).not.toContain('Private');
  await page.clock.runFor(1000);
  await expect(page.getByTestId('space-work-instructions')).toBeVisible();
  await page.clock.setSystemTime(new Date(after));
  await page.clock.runFor(1000);
  await locked(page);
  const result = await page.evaluate(async () => {
    const s = await import(String('/space-offline-store.js')), row = (await s.envelopes())[0];
    try { await s.queue(row, { id: 'work', kind: 'WORK' }); return { row, rejected: false }; }
    catch { return { row, rejected: true }; }
  });
  expect(result.rejected).toBe(true);
  expect(result.row).toEqual(sealed);
});
for (const event of ['focus', 'visibilitychange']) test(`date guard @ci-gate: immediate ${event} restore before next timer`, async ({ page }) => {
  await setup(page);
  await page.clock.setSystemTime(new Date(after));
  await page.evaluate(event => {
    if (event === 'visibilitychange') {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event(event));
    } else window.dispatchEvent(new Event(event));
  }, event);
  await locked(page);
});
test('date guard @ci-gate: late prepare cannot publish expired wrapping keys or instructions', async ({ page }) => {
  await setup(page, false);
  await page.getByTestId('space-offline-prepare').click({ noWaitAfter: true });
  await expect.poll(() => page.evaluate(() => 'releasePrepare' in window)).toBe(true);
  await page.clock.setSystemTime(new Date(after));
  await page.evaluate(() => (window as unknown as { releasePrepare: () => void }).releasePrepare());
  await expect(page.getByTestId('space-offline-status')).toContainText('expired');
  await locked(page);
});
test('date guard @ci-gate: late decrypt cannot restore data after foreground locking', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle); let hold = true;
    crypto.subtle.decrypt = async (...args) => {
      const result = await decrypt(...args);
      if (hold) { hold = false; await new Promise<void>(resolve => Object.assign(window, { releaseDecrypt: resolve })); }
      return result;
    };
    window.dispatchEvent(new Event('offline'));
  });
  await expect.poll(() => page.evaluate(() => 'releaseDecrypt' in window)).toBe(true);
  await page.clock.setSystemTime(new Date(after));
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); (window as unknown as { releaseDecrypt: () => void }).releaseDecrypt(); });
  await locked(page);
  await expect(page.getByTestId('space-offline-status')).toContainText(/locked|expired/);
});
