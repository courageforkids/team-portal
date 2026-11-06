import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, passwordProblem, hashToken, randomToken } from "../../src/server/crypto";

test("password hashing round-trips and rejects wrong passwords", async () => {
  const h = await hashPassword("Correct-horse-9");
  assert.ok(h.startsWith("scrypt$"));
  assert.equal(await verifyPassword("Correct-horse-9", h), true);
  assert.equal(await verifyPassword("correct-horse-9", h), false);
  assert.equal(await verifyPassword("anything", null), false);
});

test("password rules", () => {
  assert.ok(passwordProblem("short1"));
  assert.ok(passwordProblem("onlyletterslong"));
  assert.equal(passwordProblem("letters-and-1"), null);
});

test("tokens are random and stored only as hashes", () => {
  const a = randomToken(), b = randomToken();
  assert.notEqual(a, b);
  assert.equal(hashToken(a).length, 64);
  assert.notEqual(hashToken(a), a);
});
