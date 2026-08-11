import { describe, expect, test } from "bun:test";

import { isOriginTrusted } from "./origin-match.ts";

describe("isOriginTrusted", () => {
  test("matches normalized exact origins", () => {
    expect(isOriginTrusted("https://example.com/path", ["https://example.com"])).toBe(true);
  });

  test("matches wildcard subdomains without matching the apex", () => {
    expect(isOriginTrusted("https://auth.example.com", ["https://*.example.com"])).toBe(true);
    expect(isOriginTrusted("https://example.com", ["https://*.example.com"])).toBe(false);
  });

  test("enforces wildcard protocol and port", () => {
    const trusted = ["https://*.example.com:8443"];

    expect(isOriginTrusted("https://auth.example.com:8443", trusted)).toBe(true);
    expect(isOriginTrusted("http://auth.example.com:8443", trusted)).toBe(false);
    expect(isOriginTrusted("https://auth.example.com", trusted)).toBe(false);
  });

  test("rejects malformed and suffix-confusion origins", () => {
    expect(isOriginTrusted("not-a-url", ["https://*.example.com"])).toBe(false);
    expect(isOriginTrusted("https://example.com.attacker.test", ["https://*.example.com"])).toBe(
      false,
    );
  });
});
