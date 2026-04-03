/**
 * Typed carrier for request-level risk signals.
 * Parsed once at the HTTP boundary (controller) and passed through as a value
 * object — domain services never touch `req` directly for these signals.
 */
export interface RequestRiskContext {
  /** Client IP, resolved with trusted-proxy awareness. undefined when unavailable. */
  ip: string | undefined;
  /** Sanitized device fingerprint from x-device-fingerprint header. undefined when absent/invalid. */
  deviceFingerprint: string | undefined;
}

/**
 * Minimal subset of Express Request that extractRiskContext needs.
 * Using a structural interface keeps this testable without importing express.
 */
export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

/**
 * Parse IP and device fingerprint from a request object.
 *
 * IP resolution order (trusted-proxy aware):
 *   1. x-forwarded-for first hop (set by load balancer)
 *   2. req.ip (Express-resolved, honours trust proxy setting)
 *   3. socket.remoteAddress
 *
 * Device fingerprint:
 *   - Read from x-device-fingerprint header
 *   - Trimmed, max 512 chars, no null bytes — anything failing sanitisation
 *     returns undefined so callers receive a clean fallback signal, not garbage.
 */
export function extractRiskContext(req: RequestLike): RequestRiskContext {
  const forwarded = req.headers['x-forwarded-for'];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip =
    (rawForwarded ? rawForwarded.split(',')[0].trim() : undefined) ||
    req.ip?.trim() ||
    req.socket?.remoteAddress?.trim() ||
    undefined;

  const rawFp = req.headers['x-device-fingerprint'];
  const deviceFingerprint = normalizeFingerprint(
    Array.isArray(rawFp) ? rawFp[0] : rawFp,
  );

  return {
    ip: ip || undefined,
    deviceFingerprint,
  };
}

function normalizeFingerprint(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  // Reject empty, oversized, or injection-suspicious values
  if (trimmed.length === 0 || trimmed.length > 512) return undefined;
  if (trimmed.includes('\0')) return undefined;
  return trimmed;
}
