import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_PASSWORD = "un mot de passe";
process.env.SESSION_SECRET = "a secret for the tests";
const auth = await import("../lib/auth.js");

test("the password, and only it, opens the dashboard", () => {
  assert.ok(auth.passwordMatches("un mot de passe"));
  assert.ok(!auth.passwordMatches("un mot de pass"));
  assert.ok(!auth.passwordMatches(undefined));
});

test("a session is signed and expires", () => {
  const now = Date.now();
  const token = auth.newSession(now);
  assert.ok(auth.validSession(token, now));
  const [expires] = token.split(".");
  assert.ok(
    !auth.validSession(`${Number(expires) + 9999}.${token.split(".")[1]}`, now),
    "a stretched expiry",
  );
  assert.ok(!auth.validSession(token, now + 31 * 24 * 3600 * 1000), "past 30 days");
  assert.ok(!auth.validSession("garbage", now));
});

test("ten wrong passwords and the address waits", () => {
  const ip = "203.0.113.7";
  for (let i = 0; i < 10; i++) auth.recordFailure(ip);
  assert.ok(auth.lockedOut(ip));
  auth.clearFailures(ip);
  assert.ok(!auth.lockedOut(ip));
});
