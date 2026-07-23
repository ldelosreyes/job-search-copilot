import { createMiddleware } from "hono/factory";
import { createClient } from "@supabase/supabase-js";

/**
 * Verifies a Supabase-issued access token on every request, but only when
 * AUTH_ENABLED=true. Left unset (or any other value), this is a no-op —
 * the sandbox environment runs with no auth at all, exactly as it did
 * before this middleware existed. Only the future production environment
 * sets AUTH_ENABLED=true.
 *
 * Verifies via supabase.auth.getUser(token) (the anon key + the user's
 * own token) rather than the service-role key, since all we need here is
 * "is this a real, currently-valid session" — no admin operations.
 */
const authEnabled = process.env.AUTH_ENABLED === "true";

// Logged unconditionally at startup so a misconfiguration (e.g.
// AUTH_ENABLED=1 or AUTH_ENABLED=True — both silently false, since the
// check above is an exact match) is visible in deploy logs immediately,
// rather than only discoverable by noticing auth doesn't actually apply.
console.log(`Auth: ${authEnabled ? "ENABLED" : "DISABLED"}`);

function requireEnv(name: "SUPABASE_URL" | "SUPABASE_ANON_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`AUTH_ENABLED is true but ${name} is not set.`);
  }
  return value;
}

// Fail fast at startup (matches db/client.ts's DATABASE_URL check) rather
// than throwing mid-request on whichever request happens to arrive first.
const supabase = authEnabled
  ? createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"))
  : null;

export const requireAuth = createMiddleware(async (c, next) => {
  if (!authEnabled) {
    return next();
  }

  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { data, error } = await supabase!.auth.getUser(token);

  if (error || !data.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
});
