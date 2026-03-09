import { describe, expect, test } from "bun:test";
import { buildGeneratedPageUrl } from "../scraper/discovery.ts";

describe("discovery generated pagination", () => {
  test("builds fixed offset pages using +6 increments", () => {
    const base =
      "https://example.avature.net/careers/SearchJobs?jobRecordsPerPage=12&listFilterMode=1";

    expect(buildGeneratedPageUrl(base, 0, true)).toBe(
      "https://example.avature.net/careers/SearchJobs?jobOffset=0&jobRecordsPerPage=12&listFilterMode=1",
    );
    expect(buildGeneratedPageUrl(base, 6, true)).toBe(
      "https://example.avature.net/careers/SearchJobs?jobOffset=6&jobRecordsPerPage=12&listFilterMode=1",
    );
    expect(buildGeneratedPageUrl(base, 12, true)).toBe(
      "https://example.avature.net/careers/SearchJobs?jobOffset=12&jobRecordsPerPage=12&listFilterMode=1",
    );
  });

  test("returns base URL when pagination is disabled", () => {
    const base = "https://example.avature.net/careers";
    expect(buildGeneratedPageUrl(base, 30, false)).toBe(base);
  });
});
