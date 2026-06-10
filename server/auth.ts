/**
 * Optional password gate for /api/*. Set IMSGWEB_PASSWORD to enable;
 * unset, everything is open (plain localhost usage). Auth rides a cookie
 * rather than a header because EventSource can't send headers. The
 * cookie carries a hash of the password, not the password itself.
 */
import { timingSafeEqual } from "node:crypto";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

export const AUTH_COOKIE = "imsgweb_auth";

export function configuredPassword(): string | undefined {
  const password = process.env["IMSGWEB_PASSWORD"]?.trim();
  return password === "" ? undefined : password;
}

export function authToken(password: string): string {
  return new Bun.CryptoHasher("sha256")
    .update(`imsgweb-auth-v1:${password}`)
    .digest("hex");
}

function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function passwordMatches(candidate: string, expected: string): boolean {
  // hash both sides: equal lengths, constant-time comparison
  return tokensMatch(authToken(candidate), authToken(expected));
}

export const requireAuth = createMiddleware(async (c, next) => {
  const expected = configuredPassword();
  if (expected === undefined) return next();
  if (c.req.path === "/api/auth") return next();
  const cookie = getCookie(c, AUTH_COOKIE);
  if (cookie !== undefined && tokensMatch(cookie, authToken(expected))) {
    return next();
  }
  return c.json({ error: "unauthorized" }, 401);
});
