// Simple in-memory rate limiter. Limits requests per IP per window.
// Resets on serverless cold starts, but catches rapid-fire attacks.

const hits = new Map<string, { count: number; resetAt: number }>();

// Clean stale entries every 60s to prevent memory leaks
let lastClean = Date.now();
function clean() {
  const now = Date.now();
  if (now - lastClean < 60_000) return;
  lastClean = now;
  for (const [key, val] of hits) {
    if (now > val.resetAt) hits.delete(key);
  }
}

/**
 * Returns null if allowed, or the number of seconds to wait if rate-limited.
 * @param key   Unique key (e.g. IP address)
 * @param limit Max requests per window
 * @param windowSec Window duration in seconds
 */
export function rateLimit(key: string, limit: number, windowSec: number): number | null {
  clean();
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return null;
  }

  entry.count++;
  if (entry.count > limit) {
    return Math.ceil((entry.resetAt - now) / 1000);
  }

  return null;
}
