import { describe, expect, test } from "bun:test";
import {
  canonicalDetailUrl,
  canonicalizeUrl,
  hasCareersPath,
  hasBlockedPath,
  isLikelyJobDetailUrl,
  isLikelyListingUrl,
  normalizeProfilePath,
} from "../utils/url.ts";

describe("url utils", () => {
  test("canonicalizeUrl sorts params and drops tracking params", () => {
    const result = canonicalizeUrl(
      "https://Example.Avature.net/careers/SearchJobs?b=2&utm_source=x&a=1&tags=foo",
      undefined,
      true,
    );

    expect(result).toBe("https://example.avature.net/careers/SearchJobs?a=1&b=2");
  });

  test("flags login and error paths", () => {
    expect(hasBlockedPath("https://example.avature.net/careers/Login")).toBeTrue();
    expect(hasBlockedPath("https://example.avature.net/careers/Error")).toBeTrue();
    expect(hasBlockedPath("https://example.avature.net/careers/SearchJobs")).toBeFalse();
    expect(hasBlockedPath("https://example.avature.net/careers/JobDetail/123")).toBeFalse();
    expect(hasBlockedPath("https://example.avature.net/en_US/careers/JobDetail/123")).toBeFalse();
  });

  test("requires /careers path", () => {
    expect(hasCareersPath("https://example.avature.net/careers/SearchJobs")).toBeTrue();
    expect(hasCareersPath("https://example.avature.net/jobs/123")).toBeFalse();
  });

  test("classifies listing and detail URLs", () => {
    expect(isLikelyListingUrl("https://example.avature.net/careers/SearchJobs")).toBeTrue();
    expect(isLikelyListingUrl("https://example.avature.net/jobs")).toBeFalse();
    expect(
      isLikelyJobDetailUrl("https://example.avature.net/careers/SearchJobs?jobOffset=0&jobRecordsPerPage=12"),
    ).toBeFalse();
    expect(isLikelyJobDetailUrl("https://example.avature.net/careers/JobDetail/Senior-Engineer/123")).toBeTrue();
    expect(isLikelyJobDetailUrl("https://example.avature.net/jobs/JobDetail/123")).toBeFalse();
  });

  test("resolves relative detail URLs", () => {
    const detail = canonicalDetailUrl(
      "../careers/JobDetail/123",
      "https://abc.avature.net/en_US/careers/SearchJobs",
    );
    expect(detail).toBe("https://abc.avature.net/en_US/careers/JobDetail/123");
  });

  test("normalizes profile paths for grouped url patterns", () => {
    expect(
      normalizeProfilePath(
        "https://a2milkkf.avature.net/careers/JobDetail/Vendor-Quality-Manager-Liquid-Milk/289",
      ),
    ).toBe("/careers/JobDetail/");
    expect(
      normalizeProfilePath(
        "https://a2milkkf.avature.net/careers/SearchJobs/feed?jobRecordsPerPage=6",
      ),
    ).toBe("/careers/SearchJobs/");
  });
});
