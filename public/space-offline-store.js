/* space/1: keys are tab-scoped; IndexedDB contains wrapped keys/ciphertext only. */
export const DB = "vssyl-space-offline-1", PREFIX = "vssyl-space/1/", EPOCH = "vssyl-space-generation";
const enc = new TextEncoder(), dec = new TextDecoder();
const bytes = v => enc.encode(JSON.stringify(v)).byteLength;
const b64 = a => { const bytes = new Uint8Array(a); let text = ""; for (let i = 0; i < bytes.length; i += 32768)
    text += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(text); };
const un64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const aad = meta => enc.encode(JSON.stringify(meta));
const sameScope = (a,b) => ["facilityId","departmentId","unitId","spaceId"].every(key => a?.[key] === b?.[key]);
const key = raw => crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
async function seal(v, k, meta) { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(meta) }, k, enc.encode(JSON.stringify(v)))) }; }
async function open(v, k, meta) { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: un64(v.iv), additionalData: aad(meta) }, k, un64(v.ct)))); }
function database() { return new Promise((resolve, reject) => { const req = indexedDB.open(DB, 1); req.onupgradeneeded = () => req.result.createObjectStore("envelopes", { keyPath: "id" }); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(Error("Offline storage unavailable.")); }); }
export async function envelopes() { const db = await database(); return new Promise((resolve, reject) => { const tx = db.transaction("envelopes"); const r = tx.objectStore("envelopes").getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(Error("Offline storage unavailable.")); tx.oncomplete = () => db.close(); }); }
async function persist(row) { const db = await database(); return new Promise((resolve, reject) => { const tx = db.transaction("envelopes", "readwrite"), store = tx.objectStore("envelopes"), r = store.getAll(); let reason = ""; r.onsuccess = () => { const current = r.result.find(x => x.id === row.id); if (current && (current.revision || 0) !== (row.revision || 0)) {
    reason = "Offline context changed during storage. Reload before continuing; pending intent was preserved.";
    tx.abort();
    return;
} const next = { ...row, revision: (row.revision || 0) + 1 }; const all = r.result.filter(x => x.id !== row.id).concat(next); if (all.length > 8 || all.reduce((a, x) => a + x.commands.length, 0) > 200 || all.reduce((a, x) => a + bytes(x), 0) > 2097152) {
    reason = "Offline storage limit reached. Reconcile pending intent online; nothing was discarded.";
    tx.abort();
    return;
} store.put(next); }; tx.oncomplete = () => { row.revision = (row.revision || 0) + 1; db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(Error(reason || "Offline write did not commit.")); }; tx.onerror = () => { }; }); }
export function generation() { let g = localStorage.getItem(EPOCH); if (!g) {
    g = crypto.randomUUID();
    localStorage.setItem(EPOCH, g);
} return g; }
export function lock(reason = "Sign-out or context changed.") { for (const k of Object.keys(sessionStorage))
    if (k.startsWith(PREFIX))
        sessionStorage.removeItem(k); localStorage.setItem(EPOCH, crypto.randomUUID()); window.dispatchEvent(new CustomEvent("space-offline-locked", { detail: reason })); }
export function identity(value) { const old = sessionStorage.getItem(PREFIX + "identity"); if (old && old !== value)
    lock("Identity or Facility context changed."); sessionStorage.setItem(PREFIX + "identity", value); }
function live(meta, review = false, ctx = JSON.parse(sessionStorage.getItem(PREFIX + "context") || "null")) { if (!ctx || ctx.id !== meta.id || ctx.generation !== generation() || ctx.actorRef !== meta.actorRef || ctx.sessionVersion !== meta.sessionVersion || !sameScope(ctx.scope, meta.scope) || ctx.operationalDate !== meta.operationalDate) {
    lock("Offline data locked. Authenticate online in this actor and Space.");
    throw Error("Offline data locked. Authenticate online in this actor and Space.");
} if (!review && (Date.parse(meta.expiresAt) <= Date.now() || new Intl.DateTimeFormat("en-CA", { timeZone: meta.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) !== meta.operationalDate)) {
    lock("Offline authorization expired. Pending intent remains encrypted.");
    throw Error("Offline authorization expired. Authenticate online and review pending intent.");
} return ctx; }
// One guard for reads, actions, idle checks and foreground restoration.
export function validate(meta, review = false) { live(meta, review); }
async function dataKey(row, review = false) { live(row.meta, review); const secret = sessionStorage.getItem(PREFIX + row.id); if (!secret)
    throw Error("Pending intent is locked; authenticate online to recover it."); const raw = un64(await open(row.wrappedKey, await key(un64(secret)), row.meta)); const result = await key(raw); raw.fill(0); return result; }
export async function install(prepared, existing = null) {
    if (!crypto.subtle)
        throw Error("Secure offline storage requires Web Crypto.");
    const b = prepared.bundle, old = JSON.parse(sessionStorage.getItem(PREFIX + "context") || "null");
    if (old && (!sameScope(old.scope,b.scope) || old.actorRef !== b.actorRef || old.sessionVersion !== b.sessionVersion))
        lock("Operational scope changed.");
    const start = generation();
    const incoming = { id: b.issuanceId, scope: b.scope, actorRef: b.actorRef, sessionVersion: b.sessionVersion, operationalDate: b.operationalDate, timezone: b.timezone, expiresAt: b.expiresAt, reviewDigest: b.reviewDigest };
    if (existing && (!sameScope(existing.meta.scope,incoming.scope) || ["id","actorRef","sessionVersion","operationalDate","timezone","expiresAt","reviewDigest"].some(key => existing.meta[key] !== incoming[key]))) throw Error("Recovery metadata differs from the original issuance.");
    // jsonb may reorder scope keys. Preserve the original authenticated bytes
    // for existing ciphertext while matching every semantic scope field.
    const meta = existing ? existing.meta : incoming;
    const secret = crypto.getRandomValues(new Uint8Array(32)), raw = un64(prepared.key);
    prepared.key = null;
    try {
    const wrap = await key(secret), k = await key(raw);
    const wrappedKey = await seal(b64(raw), wrap, meta);
    raw.fill(0);
    const row = existing ? { ...existing, wrappedKey } : { id: meta.id, meta, wrappedKey, bundle: await seal(b, k, meta), commands: [] };
    // The same guard checks a prospective context before publishing its keys.
    // Recovery is review-only; it never renews the operational date or lease.
    const prospective = { ...meta, generation: start };
    live(meta, Boolean(existing), prospective);
    await persist(row);
    live(meta, Boolean(existing), prospective);
    for (const name of Object.keys(sessionStorage))
        if (name.startsWith(PREFIX) && name !== PREFIX + "identity")
            sessionStorage.removeItem(name);
    sessionStorage.setItem(PREFIX + row.id, b64(secret));
    secret.fill(0);
    sessionStorage.setItem(PREFIX + "context", JSON.stringify({ ...meta, generation: generation() }));
    return row;
    } finally { raw.fill(0); secret.fill(0); }
}
export async function read(row, review = false) {
    const k = await dataKey(row, review), original = await open(row.bundle, k, row.meta), commands = [];
    for (const c of row.commands) {
        const command = await open(c.sealed, k, row.meta);
        commands.push({...command, intentLabel: original.targets.find(t => t.id === command.target)?.label || command.target, status:c.status, outcome:c.outcome ? await open(c.outcome,k,row.meta) : null});
    }
    // A decrypt may finish after idle/foreground locking. Never return its data.
    live(row.meta, review);
    return {bundle: review ? null : original, commands};
}
export async function queue(row, target, note = "") {
    const k = await dataKey(row);
    const bundle = await open(row.bundle, k, row.meta);
    const t = bundle.targets.find(x => x.id === target.id && x.kind === target.kind);
    if (!t?.available || t.completed)
        throw Error("This target cannot be completed offline.");
    if (note.length > 1000)
        throw Error("Note exceeds 1,000 characters.");
    for (const existing of row.commands) {
        const old = await open(existing.sealed, k, row.meta);
        if (old.target === target.id)
            throw Error("This action is already pending or confirmed on this tablet.");
    }
    const command = { id: crypto.randomUUID(), issuanceId: row.id, kind: t.kind, target: t.id, baseline: t.baseline, occurredAt: new Date().toISOString(), note };
    if (bytes(command) > 8192)
        throw Error("Command exceeds 8 KiB.");
    const next = { ...row, commands: [...row.commands, { id: command.id, status: "pending", sealed: await seal(command, k, row.meta) }] };
    live(row.meta);
    await persist(next);
    return next;
}
export async function apply(row, outcomes) {
    const k = await dataKey(row, true);
    const commands = [];
    for (const c of row.commands) {
        const result = outcomes.find(o => o.id === c.id);
        commands.push(result ? { ...c, status: result.status, outcome: await seal(result, k, row.meta) } : c);
    }
    live(row.meta, true);
    const next = { ...row, commands };
    await persist(next);
    return next;
}
export async function clearAll() { lock("Full unbind."); const db = await database(); await new Promise((resolve, reject) => { const tx = db.transaction("envelopes", "readwrite"); tx.objectStore("envelopes").clear(); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(Error("Could not clear local offline data.")); }); }
export async function pendingCount() { return (await envelopes()).reduce((n, r) => n + r.commands.filter(c => !['committed', 'reused'].includes(c.status)).length, 0); }
export function activeId() { return JSON.parse(sessionStorage.getItem(PREFIX + "context") || "null")?.id || null; }
if (typeof window !== "undefined") {
    const navigation = performance.getEntriesByType('navigation')[0];
    // A new/restored document may inherit sessionStorage. Only an actual reload
    // may reuse this tab's lease; a fresh document must authenticate online.
    if (activeId() && navigation?.type !== 'reload') lock('A new or restored tab requires online authorization.');
    if (window.opener)
        lock("A new tab requires online authorization.");
    window.addEventListener("storage", e => { if (e.key === EPOCH) {
        for (const k of Object.keys(sessionStorage))
            if (k.startsWith(PREFIX))
                sessionStorage.removeItem(k);
        window.dispatchEvent(new CustomEvent("space-offline-locked", { detail: "Another tab changed the authenticated context." }));
    } });
    window.addEventListener("pageshow", event => { if (event.persisted) { lock('Restored pages require online authorization.'); return; } const c = JSON.parse(sessionStorage.getItem(PREFIX + "context") || "null"); if (c && c.generation !== generation())
        lock("Stale page context."); });
}
// Never evict unresolved intent to make room. Users can remove empty or fully
// reconciled envelopes explicitly; the transaction rechecks every current row.
export async function pruneReconciled() {
    const db = await database();
    let removedActive = false;
    await new Promise((resolve, reject) => {
        const tx = db.transaction('envelopes', 'readwrite'), store = tx.objectStore('envelopes'), request = store.getAll();
        request.onsuccess = () => {
            for (const row of request.result) if (row.commands.every(c => ['committed','reused'].includes(c.status))) {
                if (row.id === activeId()) removedActive = true;
                store.delete(row.id);
            }
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(Error('Could not remove reconciled preparations.')); };
    });
    if (removedActive) lock('Reconciled preparation removed. Pending intent was preserved.');
}
