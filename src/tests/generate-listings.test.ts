import { describe, expect, test } from "bun:test";
import type { HostProfile } from "../types/index.ts";
import {
  generateListingTemplates,
  templateFromUrl,
} from "../scraper/generate-listings.ts";

function makeProfile(listingUrls: string[]): HostProfile {
  return {
    host: "example.avature.net",
    reachability: "reachable",
    candidateCount: listingUrls.length,
    reachableCandidateCount: listingUrls.length,
    unreachableCandidateCount: 0,
    reachableListingUrls: listingUrls,
    reachableSeedDetailUrls: [],
    checkedAt: "2026-03-09T00:00:00.000Z",
  };
}

describe("listing template generation", () => {
  test("templateFromUrl detects pagination hints and preserves canonical URL", () => {
    const template = templateFromUrl(
      "https://example.avature.net/careers/SearchJobs?listFilterMode=1&jobRecordsPerPage=12&jobOffset=24",
    );

    expect(template).not.toBeNull();
    expect(template?.supportsPagination).toBeTrue();
    expect(template?.pageSize).toBe(12);
    expect(template?.url).toBe(
      "https://example.avature.net/careers/SearchJobs?jobOffset=24&jobRecordsPerPage=12&listFilterMode=1",
    );
  });

  test("generateListingTemplates keeps observed page size and only resets offset", () => {
    const profile = makeProfile([
      "https://example.avature.net/careers/SearchJobs?jobOffset=36&jobRecordsPerPage=6&listFilterMode=1",
    ]);

    const templates = generateListingTemplates(profile, 3);

    expect(templates).toHaveLength(1);
    expect(templates.every((template) => template.supportsPagination)).toBeTrue();
    expect(templates.every((template) => template.url.includes("jobOffset=0"))).toBeTrue();
    expect(templates[0]?.url.includes("jobRecordsPerPage=6")).toBeTrue();
  });
});
