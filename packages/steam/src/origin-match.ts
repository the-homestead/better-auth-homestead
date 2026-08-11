const WILDCARD_SUBDOMAIN_PREFIX = "*.";
const PROTOCOL_PREFIX_RE = /^https?:\/\//;

function normalizeOrigin(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function wildcardPatternMatchesOrigin(origin: URL, pattern: string): boolean {
  const trimmed = pattern.trim();
  const hasProtocolPrefix = trimmed.startsWith("http://") || trimmed.startsWith("https://");

  let expectedProtocol: "http:" | "https:" | null = null;
  if (hasProtocolPrefix) {
    expectedProtocol = trimmed.startsWith("https://") ? "https:" : "http:";
  }

  const withoutProtocol = hasProtocolPrefix ? trimmed.replace(PROTOCOL_PREFIX_RE, "") : trimmed;
  const [hostPattern, portPattern] = withoutProtocol.split(":");

  if (!hostPattern?.startsWith(WILDCARD_SUBDOMAIN_PREFIX)) {
    return false;
  }

  const suffix = hostPattern.slice(WILDCARD_SUBDOMAIN_PREFIX.length);
  if (!suffix) {
    return false;
  }

  if (expectedProtocol && origin.protocol !== expectedProtocol) {
    return false;
  }

  if (portPattern && origin.port !== portPattern) {
    return false;
  }

  return origin.hostname !== suffix && origin.hostname.endsWith(`.${suffix}`);
}

export function isOriginTrusted(
  origin: string | null | undefined,
  trustedOrigins: readonly string[],
): boolean {
  const normalized = normalizeOrigin(origin);

  if (!normalized || trustedOrigins.length === 0) {
    return false;
  }

  if (trustedOrigins.includes(normalized)) {
    return true;
  }

  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(normalized);
  } catch {
    return false;
  }

  return trustedOrigins.some((candidate) => {
    if (!candidate.includes("*")) {
      return false;
    }

    return wildcardPatternMatchesOrigin(parsedOrigin, candidate);
  });
}
