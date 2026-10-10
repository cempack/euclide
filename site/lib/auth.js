// /admin: one password (ADMIN_PASSWORD), then a signed cookie for 30 days.
// Wrong passwords are counted per address: ten in 15 minutes and it waits.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const COOKIE = "eu_admin";
const MAX_AGE = 30 * 24 * 3600;
const WINDOW = 15 * 60 * 1000;
const MAX_FAILURES = 10;

// Without SESSION_SECRET, sessions last until the next restart.
const secret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const digest = (text) => createHash("sha256").update(String(text)).digest();
const sign = (payload) => createHmac("sha256", secret).update(payload).digest("base64url");

export const adminEnabled = () => !!process.env.ADMIN_PASSWORD;

export function passwordMatches(candidate) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof candidate !== "string") return false;
  return timingSafeEqual(digest(candidate), digest(expected));
}

export function newSession(now = Date.now()) {
  const expires = String(Math.floor(now / 1000) + MAX_AGE);
  return `${expires}.${sign(expires)}`;
}

export function validSession(token, now = Date.now()) {
  if (typeof token !== "string") return false;
  const [expires, mac] = token.split(".");
  if (!expires || !mac || !/^\d+$/.test(expires)) return false;
  const good = Buffer.from(sign(expires));
  const given = Buffer.from(mac);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return false;
  return Number(expires) * 1000 > now;
}

export function sessionCookie(token, secure) {
  return [
    `${COOKIE}=${token}`,
    "Path=/admin",
    `Max-Age=${MAX_AGE}`,
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export const clearedCookie = (secure) =>
  [`${COOKIE}=`, "Path=/admin", "Max-Age=0", "HttpOnly", "SameSite=Strict", secure ? "Secure" : ""]
    .filter(Boolean)
    .join("; ");

const failures = new Map();

export function lockedOut(ip, now = Date.now()) {
  const f = failures.get(ip);
  if (!f || now - f.since > WINDOW) return false;
  return f.count >= MAX_FAILURES;
}

export function recordFailure(ip, now = Date.now()) {
  const f = failures.get(ip);
  if (!f || now - f.since > WINDOW) failures.set(ip, { since: now, count: 1 });
  else f.count += 1;
}

export function clearFailures(ip) {
  failures.delete(ip);
}
