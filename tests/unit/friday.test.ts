import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, costMills, hotp, localParts, stableJson, verifyTotp } from "../../src/lib/friday-pure";

test("TOTP matches the RFC 6238 test vector and accepts one step of drift", async () => {
  const secret = Buffer.from("12345678901234567890");
  assert.equal(await hotp(secret, Math.floor(59 / 30), 8), "94287082");
  assert.equal(await hotp(secret, Math.floor(1111111109 / 30), 8), "07081804");
  const b32 = base32Encode(secret);
  assert.deepEqual(base32Decode(b32), secret);
  const now = 1_800_000_000_000;
  const code = await hotp(secret, Math.floor(now / 30000));
  assert.equal(await verifyTotp(b32, code, now), true);
  assert.equal(await verifyTotp(b32, code, now + 30_000), true);
  assert.equal(await verifyTotp(b32, code, now + 90_000), false);
  assert.equal(await verifyTotp(b32, "abc", now), false);
});

test("approval hashes are stable and change with any edit", () => {
  assert.equal(stableJson({ b: 1, a: [1, { y: 2, x: 1 }] }), stableJson({ a: [1, { x: 1, y: 2 }], b: 1 }));
  assert.notEqual(stableJson({ title: "Hi" }), stableJson({ title: "Hi!" }));
});

test("spend and time zones", () => {
  assert.equal(costMills({ input_tokens: 1_000_000, output_tokens: 100_000 }), 6000);
  assert.deepEqual(localParts("America/New_York", new Date("2026-11-15T05:30:00Z")), { date: "2026-11-15", hour: 0 });
});
