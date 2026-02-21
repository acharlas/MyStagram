const DEFAULT_AUTH_REDIRECT = "/";

export function resolveSafeAuthRedirectTarget(
  input: string | null | undefined,
): string {
  if (!input) {
    return DEFAULT_AUTH_REDIRECT;
  }

  const trimmed = input.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT;
  }
  if (trimmed.startsWith("/api/auth")) {
    return DEFAULT_AUTH_REDIRECT;
  }
  return trimmed;
}
