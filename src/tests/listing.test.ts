import { describe, expect, test } from "bun:test";
import { extractJobLinksFromPage } from "../extractors/listing.ts";

describe("listing extraction", () => {
  test("keeps only likely job detail URLs", () => {
    const html = `
      <html>
        <body>
          <a href="/careers/JobDetail/One/1">One</a>
          <a href="/careers/SearchJobs?jobOffset=12">Search</a>
          <a href="/careers/Login">Login</a>
          <script>
            window.__INITIAL_STATE__ = {
              "jobs": [
                {"url": "/careers/JobDetail/Two/2?source=linkedin"}
              ],
              "jobOffset": 0,
              "jobRecordsPerPage": 12
            }
          </script>
          <div class="list-controls__text__legend" aria-label="24 results">
            1-12 of 24 results
          </div>
        </body>
      </html>
    `;

    const extraction = extractJobLinksFromPage(
      "https://example.avature.net/careers/SearchJobs",
      html,
      "text/html",
    );

    expect(extraction.jobDetailUrls).toContain("https://example.avature.net/careers/JobDetail/One/1");
    expect(extraction.jobDetailUrls).toContain("https://example.avature.net/careers/JobDetail/Two/2");
    expect(
      extraction.jobDetailUrls.some((url) => url.includes("/SearchJobs") || url.includes("/Login")),
    ).toBeFalse();
    expect(
      extraction.rejectedCandidates.some((url) => url.includes("/Login")),
    ).toBeTrue();
    expect(extraction.queryParamHints).toContain("jobOffset");
    expect(extraction.queryParamHints).toContain("jobRecordsPerPage");
    expect(extraction.paginationLegend?.pageSize).toBe(12);
    expect(extraction.paginationLegend?.totalResults).toBe(24);
  });
});
