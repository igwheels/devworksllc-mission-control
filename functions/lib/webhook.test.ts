import { describe, it, expect } from 'vitest';
import { verifyLinearSignature, isFreshDelivery, WEBHOOK_TOLERANCE_MS } from './webhook';

const SECRET = 'whsec_test';
const body = JSON.stringify({ type: 'Issue', action: 'create', webhookTimestamp: 1_000_000 });
async function sign(b: string, s = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(b)));
  return Array.from(mac, (x) => x.toString(16).padStart(2, '0')).join('');
}

describe('verifyLinearSignature', () => {
  it('accepts a correct HMAC-SHA256 hex signature over the raw body', async () => {
    expect(await verifyLinearSignature(body, await sign(body), SECRET)).toBe(true);
  });

  it('rejects a signature made with another secret', async () => {
    expect(await verifyLinearSignature(body, await sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a tampered body', async () => {
    expect(await verifyLinearSignature(body + ' ', await sign(body), SECRET)).toBe(false);
  });

  it('rejects a missing, empty, or non-hex signature', async () => {
    expect(await verifyLinearSignature(body, null, SECRET)).toBe(false);
    expect(await verifyLinearSignature(body, '', SECRET)).toBe(false);
    expect(await verifyLinearSignature(body, 'zz-not-hex', SECRET)).toBe(false);
    expect(await verifyLinearSignature(body, 'abc', SECRET)).toBe(false);
  });
});

describe('isFreshDelivery', () => {
  const NOW = 2_000_000;
  it('accepts a timestamp within the tolerance either side of now', () => {
    expect(isFreshDelivery(NOW, NOW)).toBe(true);
    expect(isFreshDelivery(NOW - WEBHOOK_TOLERANCE_MS, NOW)).toBe(true);
    expect(isFreshDelivery(NOW + WEBHOOK_TOLERANCE_MS, NOW)).toBe(true);
  });

  it('rejects replays outside the window, and missing or non-numeric timestamps', () => {
    expect(isFreshDelivery(NOW - WEBHOOK_TOLERANCE_MS - 1, NOW)).toBe(false);
    expect(isFreshDelivery(undefined, NOW)).toBe(false);
    expect(isFreshDelivery('2026-10-03', NOW)).toBe(false);
  });
});
