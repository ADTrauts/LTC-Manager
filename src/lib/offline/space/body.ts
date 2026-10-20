/** Bound actual streamed bytes before parsing. Never retain an unbounded body. */
export async function readOfflineBody(request: Request, max = 196608): Promise<string> {
    const reader = request.body?.getReader();
    if (!reader)
        return "";
    const chunks: Uint8Array[] = [];
    let length = 0;
    const deadline = Date.now() + 10000;
    try {
        for (;;) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const part = await Promise.race([reader.read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Request timed out.")), Math.max(1, deadline - Date.now())); })]).finally(() => clearTimeout(timer));
            if (part.done)
                break;
            length += part.value.byteLength;
            if (length > max)
                throw Error("Request too large.");
            chunks.push(part.value);
        }
    }
    catch (e) {
        await reader.cancel().catch(() => { });
        throw e;
    }
    const all = new Uint8Array(length);
    let offset = 0;
    for (const c of chunks) {
        all.set(c, offset);
        offset += c.length;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(all);
}
