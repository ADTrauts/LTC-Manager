import test from 'node:test';
import assert from 'node:assert/strict';
import { readOfflineBody } from './body';
test('offline input bounds streamed actual UTF8 bytes without trusting Content-Length', async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('é'.repeat(100))); }, cancel() { canceled = true; } });
    const request = new Request('https://example.test', { method: 'POST', body: stream, headers: { 'content-length': '1' }, duplex: 'half' } as RequestInit);
    await assert.rejects(() => readOfflineBody(request, 100), /too large/);
    assert.equal(canceled, true);
    assert.equal(await readOfflineBody(new Request('https://example.test', { method: 'POST', body: 'valid' }), 5), 'valid');
    await assert.rejects(() => readOfflineBody(new Request('https://example.test', { method: 'POST', body: new Uint8Array([0xff]) })), /encoded|encoding/i);
});
