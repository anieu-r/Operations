/**
 * Tiny in-memory fixed-window rate limiter (per client IP). Nothing is
 * persisted — IPs live only in process memory for the length of the window.
 */

export function rateLimit({ windowMs, max, message, envOverride }) {
  if (envOverride && Number(process.env[envOverride]) > 0) max = Number(process.env[envOverride]);
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ ok: false, error: message || 'Too many requests — please try again later.' });
    }
    next();
  };
}
