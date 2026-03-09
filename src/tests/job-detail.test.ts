import { describe, expect, test } from "bun:test";
import { extractJobDetail } from "../extractors/jobDetail.ts";

describe("job detail extraction", () => {
  test("extracts title, descriptions, application URL, and metadata", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Senior Data Engineer" />
        </head>
        <body>
          <div class="job-location">Austin, TX</div>
          <div class="posting-date">2026-03-01</div>
          <div id="job-description">
            <p>Build reliable data pipelines.</p>
          </div>
          <a href="/apply/123">Apply now</a>
        </body>
      </html>
    `;

    const record = extractJobDetail(
      "example.avature.net",
      "https://example.avature.net/careers/JobDetail/123?jobId=123",
      html,
    );

    expect(record.jobTitle).toBe("Senior Data Engineer");
    expect(record.jobDescriptionText?.includes("Build reliable data pipelines.")).toBeTrue();
    expect(record.jobDescriptionHtml?.includes("Build reliable data pipelines.")).toBeTrue();
    expect(record.applicationUrl).toBe("https://example.avature.net/apply/123");
    expect(record.metadata.location).toBe("Austin, TX");
    expect(record.metadata.jobId).toBe("123");
  });
});
