import * as store from "/space-offline-store.js";
const el = (tag, text, test) => { const e = document.createElement(tag); if (text)
    e.textContent = text; if (test)
    e.dataset.testid = test; return e; };
const scopeEqual = (a, b) => ["facilityId", "departmentId", "unitId", "spaceId"].every(key => a?.[key] === b?.[key]);
async function call(action, input) { const path = ['sync', 'reconcile'].includes(action) ? 'runtime-sync' : 'runtime-bundle'; const response = await fetch(`/api/offline/${path}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ protocol: 'space/1', action, ...input }) }); const body = await response.json(); if (!response.ok)
    throw Error(body.error || 'Reconnect and authenticate online.'); return body; }
async function mount(root) {
    if (root.dataset.booted)
        return;
    root.dataset.booted = 'true';
    let ctx = root.dataset.spaceOffline ? JSON.parse(root.dataset.spaceOffline) : null, row = null, review = false, version = store.generation(), busy = false;
    const title = el('h2', 'Offline for this Space'), status = el('p', 'Not prepared.', 'space-offline-status'), content = el('div'), controls = el('div');
    status.setAttribute('role', 'status'); root.replaceChildren(title, status, controls, content);
    root.className = 'rounded-xl border border-zinc-200 bg-white p-4 space-y-3';
    const liveLink = el('a', 'Return to live Space'); liveLink.href = location.href; liveLink.onclick = event => { event.preventDefault(); if (navigator.onLine) location.reload(); else status.textContent = 'Reconnect before returning to live tools.'; }; controls.append(liveLink);
    const button = (label, test, fn) => { const b = el('button', label, test); b.type = 'button'; b.className = 'rounded-md border px-3 py-2 mr-2 mt-2 text-sm'; b.onclick = async () => { if (busy)
        return; busy = true; b.disabled = true; try {
        await fn();
    }
    catch (e) {
        status.textContent = e.message;
    }
    finally {
        busy = false;
        b.disabled = false;
    } }; return b; };
    function boundary() {
        if (!root.isConnected) throw Error('Offline view changed. Authenticate online again.');
        if (version !== store.generation()) {
            store.lock('Context changed. Authenticate online again.');
            throw Error('Context changed. Authenticate online again.');
        }
        if (row) store.validate(row.meta, review);
    }
    async function load() {
        const rows = await store.envelopes();
        row = rows.find(r => r.id === store.activeId()) || null;
        if (row && ctx && (!scopeEqual(row.meta.scope, ctx.scope) || row.meta.actorRef !== ctx.actorRef || row.meta.sessionVersion !== ctx.sessionVersion)) {
            store.lock('Space or identity context changed.');
            row = null;
        }
        if (row && !ctx) {
            const url = new URL(location.href);
            if (url.pathname !== `/unit/${row.meta.scope.unitId}` || url.searchParams.get('space') !== row.meta.scope.spaceId) {
                store.lock('Exact Space changed. Authenticate online to recover.');
                row = null;
            }
        }
        await render();
    }
    async function render() {
        content.replaceChildren();
        syncButton.hidden = !row;
        if (!row) {
            status.textContent = 'No unlocked offline context. Prepare online or authenticate and recover pending intent.';
            return;
        }
        const data = await store.read(row, review);
        boundary();
        if (!data.bundle) {
            title.textContent = 'Offline for this Space';
            status.textContent = 'Expired intent review only — no operational instructions or new actions.';
        }
        else {
            title.textContent = `Offline — ${data.bundle.label}`;
            status.textContent = navigator.onLine ? 'Prepared on this tablet. Pending actions are not confirmed.' : 'Offline — prepared for this exact Space.';
            for (const t of data.bundle.targets) {
                const card = el('section');
                card.className = 'border-t py-2';
                card.append(el('p', t.label)); if (t.instructions) card.append(el('p', t.instructions, 'space-work-instructions'));
                const queued = data.commands.find(c => c.target === t.id);
                if (queued)
                    card.append(el('p', `Result: ${queued.status}${queued.outcome?.message ? " — " + queued.outcome.message : ""}`, 'space-command-result'));
                if (t.completed)
                    card.append(el('p', 'Already confirmed on server.'));
                else if (t.available) {
                    const b = button(t.kind === 'WORK' ? 'Complete Work on this tablet' : 'Record Key Time actual on this tablet', t.kind === 'WORK' ? 'space-work-complete' : 'space-key-time-actual', async () => { row = await store.queue(row, t); boundary(); await render(); });
                    b.dataset.targetOrder = String(data.bundle.targets.filter(x => x.kind === t.kind).indexOf(t));
                    if (queued)
                        b.disabled = true;
                    card.append(b);
                }
                else
                    card.append(el('p', t.unavailableReason || 'Complete online with required evidence.'));
                content.append(card);
            }
        }
        for (const c of data.commands)
            if (!data.bundle)
                content.append(el('p', `${c.kind}: ${c.intentLabel} — ${c.occurredAt}${c.note ? " — Note: " + c.note : ""} — ${c.status}${c.outcome?.message ? " — " + c.outcome.message : ""}`, 'space-command-result'));
        content.append(el('p', 'Key Time corrections and expected-time adjustments are unavailable offline. Use the existing online Cycle tools.', 'space-online-only'));
    }
    async function sync() {
        if (!navigator.onLine)
            throw Error('Reconnect to reconcile pending actions.');
        if (!row)
            throw Error('Recover the issuance first.');
        boundary();
        const data = await store.read(row, review);
        const commands = data.commands.filter(c => !['committed', 'reused', 'blocked', 'conflict'].includes(c.status)).slice(0, 20).map(({ status, outcome, intentLabel, ...c }) => c);
        if (!commands.length) {
            await render();
            return;
        }
        const reconciled = await call('reconcile', { commands });
        boundary();
        row = await store.apply(row, reconciled.outcomes);
        const unknownIds = new Set(reconciled.outcomes.filter(o => o.status === 'unknown').map(o => o.id));
        const remaining = commands.filter(c => unknownIds.has(c.id));
        if (remaining.length) {
            const result = await call('sync', { commands: remaining, reviewedExpired: review });
            boundary();
            row = await store.apply(row, result.outcomes);
            for (const r of result.outcomes)
                if (['blocked', 'conflict', 'unknown'].includes(r.status))
                    status.textContent = r.message;
        }
        await render();
    }
    if (ctx) {
        controls.append(button('Save on this tablet', 'space-offline-prepare', async () => { if (!navigator.onLine)
            throw Error('Prepare this Space online before disconnecting.'); const start = store.generation(); const prepared = await call('prepare', { scope: ctx.scope }); if (!root.isConnected || start !== store.generation())
            throw Error('Context changed during preparation.'); if (prepared.bundle.actorRef !== ctx.actorRef || prepared.bundle.sessionVersion !== ctx.sessionVersion || !scopeEqual(prepared.bundle.scope, ctx.scope))
            throw Error('Authenticated context changed. Reload online.'); row = await store.install(prepared); version = store.generation(); review = false; await render(); }));
    }
    controls.append(button('Remove preparations with no pending actions', 'space-offline-prune', async () => { await store.pruneReconciled(); await load(); }));
    controls.append(button('Lock offline access', 'space-offline-lock', async () => store.lock('Offline access locked. Pending intent remains encrypted. Authenticate online to recover.')));
    const syncButton = button('Reconcile and sync pending actions', 'space-offline-sync', sync);
    syncButton.hidden = true;
    controls.append(syncButton);
    controls.append(button('Review locked pending intent online', 'space-offline-recovery', async () => {
        if (!navigator.onLine)
            throw Error('Online reauthentication is required.');
        const rows = (await store.envelopes()).filter(r => (!ctx || r.meta.actorRef === ctx.actorRef) && (!ctx || scopeEqual(r.meta.scope, ctx.scope)) && r.commands.some(c => !['committed', 'reused'].includes(c.status)));
        content.replaceChildren(el('p', 'Sign in again with the same account and original password/PIN sign-in method, return to this Space, then explicitly recover the intended issuance.'));
        for (const old of rows)
            content.append(button(`Recover and review ${old.id} (${old.commands.length} actions)`, 'space-recover-issuance', async () => { const start = store.generation(); const p = await call('recover', { issuanceId: old.id, digest: old.meta.reviewDigest, review: true }); if (!root.isConnected || start !== store.generation())
                throw Error('Context changed during recovery.'); if (ctx && (p.bundle.actorRef !== ctx.actorRef || !scopeEqual(p.bundle.scope, ctx.scope)))
                throw Error('Wrong actor or scope.'); row = await store.install(p, old); version = store.generation(); review = true; await render(); }));
    }));
    const locked = e => { row = null; syncButton.hidden = true; title.textContent = 'Offline for this Space'; content.replaceChildren(); status.textContent = e.detail || 'Offline data locked.'; };
    window.addEventListener('space-offline-locked', locked);
    const offline = () => { void render().catch(e => { status.textContent = e.message; content.replaceChildren(); }); };
    window.addEventListener('offline', offline);
    const validateCurrent = () => {
        if (!root.isConnected || !row) return;
        try { boundary(); } catch (e) {
            // The shared guard erases wrapping secrets and dispatches the lock.
            // Also discard this view if it was invalidated during an async write.
            locked({ detail: e.message });
        }
    };
    const visible = () => { if (document.visibilityState === 'visible') validateCurrent(); };
    window.addEventListener('focus', validateCurrent);
    window.addEventListener('pageshow', validateCurrent);
    document.addEventListener('visibilitychange', visible);
    // No automatic retry of unknown/expired intent. User reconciles the same IDs.
    const timer = setInterval(() => { if (!root.isConnected) {
        clearInterval(timer);
        window.removeEventListener('space-offline-locked', locked);
        window.removeEventListener('offline', offline);
        window.removeEventListener('focus', validateCurrent);
        window.removeEventListener('pageshow', validateCurrent);
        document.removeEventListener('visibilitychange', visible);
        return;
    } validateCurrent(); }, 1000);
    await load().catch(e => { status.textContent = e.message; content.replaceChildren(); });
}
function scan() { try {
    const active = JSON.parse(sessionStorage.getItem(store.PREFIX + "context") || "null");
    const url = new URL(location.href);
    if (active && (url.pathname !== `/unit/${active.scope.unitId}` || url.searchParams.get("space") !== active.scope.spaceId)) store.lock("Execution context changed. Pending intent remains encrypted.");
    for (const e of document.querySelectorAll('[data-space-identity]')) {
        store.identity(e.dataset.spaceIdentity);
    }
    for (const e of document.querySelectorAll('[data-space-offline],[data-space-offline-fallback]'))
        void mount(e).catch(() => { e.textContent = "Secure offline storage is unavailable. Reconnect and use online tools."; });
}
catch {
    for (const e of document.querySelectorAll('[data-space-offline],[data-space-offline-fallback]'))
        e.textContent = "Secure offline storage is unavailable. Use online tools.";
} }
scan();
new MutationObserver(scan).observe(document.documentElement, { subtree: true, childList: true });
export { mount };

// Do not leave protected server-rendered operational instructions visible during
// an offline lease. The public renderer owns all offline data and expiry checks.
function enterOffline() {
    if (navigator.onLine || !document.querySelector('[data-space-offline]')) return;
    const main = el('main');
    main.dataset.spaceOfflineFallback = '';
    document.body.replaceChildren(main);
    void mount(main).catch(() => { main.textContent = 'Offline access unavailable. Reconnect to authenticate.'; });
}
window.addEventListener('offline', enterOffline);
enterOffline();
