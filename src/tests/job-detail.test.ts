import { describe, expect, test } from "bun:test";
import { extractJobDetail } from "../extractors/jobDetail.ts";

describe("job detail extraction", () => {
  test("extracts title, descriptions, application URL, and avature field metadata", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Senior Data Engineer" />
        </head>
        <body>
          <div class="article__content__view">
            <div class="article__content__view__field">
              <div class="article__content__view__field__label">Job Title</div>
              <div class="article__content__view__field__value">Production Operator</div>
            </div>
            <div class="article__content__view__field">
              <div class="article__content__view__field__label">Location</div>
              <div class="article__content__view__field__value">Australia - New South Wales</div>
            </div>
            <div class="article__content__view__field">
              <div class="article__content__view__field__label">Date Published</div>
              <div class="article__content__view__field__value">Thursday, March 5, 2026</div>
            </div>
            <div class="article__content__view__field">
              <div class="article__content__view__field__label">Ref #</div>
              <div class="article__content__view__field__value">376</div>
            </div>
            <div class="article__content__view__field">
              <div class="article__content__view__field__label">Work Type</div>
              <div class="article__content__view__field__value">Permanent</div>
            </div>
            <div class="article__content__view__field">
              <div class="article__content__view__field__label">Business Unit</div>
              <div class="article__content__view__field__value">Production</div>
            </div>
          </div>
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
    expect(record.metadata["Job Title"]).toBe("Production Operator");
    expect(record.metadata.Location).toBe("Australia - New South Wales");
    expect(record.metadata["Date Published"]).toBe("Thursday, March 5, 2026");
    expect(record.metadata["Ref #"]).toBe("376");
    expect(record.metadata["Work Type"]).toBe("Permanent");
    expect(record.metadata["Business Unit"]).toBe("Production");
    expect(record.metadata.location).toBe("Australia - New South Wales");
    expect(record.metadata.jobId).toBe("123");
  });
});
