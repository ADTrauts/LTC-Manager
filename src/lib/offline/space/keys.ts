import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export const PROOF_COOKIE = "ltc_offline_reauth";
function ring() {
    const value = JSON.parse(process.env.OFFLINE_RECOVERY_KEYS || "{}") as Record<string, string>;
    if (Object.keys(value).length > 4)
        throw Error("Offline recovery keyring is invalid.");
    return value;
}
export function escrowKey(key: Buffer, aad: string) {
    const keyId = process.env.OFFLINE_RECOVERY_ACTIVE_KEY || "";
    const wrap = Buffer.from(ring()[keyId] || "", "base64");
    if (wrap.length !== 32)
        throw Error("Secure offline preparation is not configured.");
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", wrap, iv);
    cipher.setAAD(Buffer.from(aad));
    const ciphertext = Buffer.concat([cipher.update(key), cipher.final()]);
    return { keyId, iv: iv.toString("base64"), ciphertext: ciphertext.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
export function openEscrow(envelope: unknown, aad: string): Buffer {
    const e = envelope as ReturnType<typeof escrowKey>, key = Buffer.from(ring()[e.keyId] || "", "base64");
    if (key.length !== 32)
        throw Error("Recovery key unavailable; pending intent is preserved.");
    const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(e.iv, "base64"));
    cipher.setAAD(Buffer.from(aad));
    cipher.setAuthTag(Buffer.from(e.tag, "base64"));
    return Buffer.concat([cipher.update(Buffer.from(e.ciphertext, "base64")), cipher.final()]);
}
const sign = (body: string) => createHmac("sha256", process.env.AUTH_SECRET || (() => { throw Error("AUTH_SECRET required"); })()).update(`offline-reauth/1:${body}`).digest("base64url");
export function credentialProof(actorRef: string, version: number, now = Date.now()) { const body = Buffer.from(JSON.stringify({ actorRef, version, at: now, nonce: randomBytes(16).toString("hex") })).toString("base64url"); return `${body}.${sign(body)}`; }
export function readCredentialProof(value: string, actorRef: string, version: number, after: number, now = Date.now()) {
    try {
        const [body, sig, extra] = value.split(".");
        if (extra || !sig || value.length > 1000)
            return false;
        const a = Buffer.from(sig), b = Buffer.from(sign(body));
        if (a.length !== b.length || !timingSafeEqual(a, b))
            return false;
        const proof = JSON.parse(Buffer.from(body, "base64url").toString());
        return proof.actorRef === actorRef && proof.version === version && proof.at > after && proof.at <= now && now - proof.at <= 300000;
    }
    catch {
        return false;
    }
}
export function proofCookieOptions() { return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 300 }; }
