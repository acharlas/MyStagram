import { createHash, createHmac } from "node:crypto";

export const RATE_LIMIT_CLIENT_HEADER = "X-RateLimit-Client";
export const RATE_LIMIT_SIGNATURE_HEADER = "X-RateLimit-Signature";

export function buildRateLimitClientKeyFromIdentifier(
  identifier: string | null | undefined,
): string | null {
  const normalized = identifier?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }

  const digest = createHash("sha256").update(normalized).digest("hex");
  return digest.slice(0, 32);
}

export function buildRateLimitClientSignature(
  clientKey: string | null,
): string | null {
  if (!clientKey) {
    return null;
  }
  const secret = process.env.RATE_LIMIT_PROXY_SECRET?.trim();
  if (!secret) {
    return null;
  }
  return createHmac("sha256", secret).update(clientKey).digest("hex");
}
