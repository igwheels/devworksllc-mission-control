// Linear webhook verification. Pure (Web Crypto only) so it can be unit-tested
// from Node. Linear signs the raw request body with the webhook's secret and
// sends the hex HMAC-SHA256 in the `linear-signature` header; the body also
// carries `webhookTimestamp` (ms) which we bound to reject replays.

/** Accept deliveries whose timestamp is within this window of now. */
export const WEBHOOK_TOLERANCE_MS = 60_000;

const enc = new TextEncoder();

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** True only when `signatureHex` is the HMAC of `rawBody` under `secret`
 *  (compared in constant time by crypto.subtle.verify). */
export async function verifyLinearSignature(
  rawBody: string,
  signatureHex: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHex) return false;
  const sig = hexToBytes(signatureHex.trim());
  if (!sig) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, sig, enc.encode(rawBody));
}

/** True when the delivery's own `webhookTimestamp` is close to `nowMs`. */
export function isFreshDelivery(webhookTimestamp: unknown, nowMs: number): boolean {
  return typeof webhookTimestamp === 'number' && Math.abs(nowMs - webhookTimestamp) <= WEBHOOK_TOLERANCE_MS;
}
