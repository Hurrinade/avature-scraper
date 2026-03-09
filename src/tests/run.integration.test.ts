import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runProfileBuilder, runScraper } from "../scraper/run.ts";
import type {
  HostProfile,
  JobOutput,
  JobUrlRecord,
  RejectedUrlRecord,
} from "../types/index.ts";
import { fileExists, readJsonFile } from "../utils/fs.ts";
import { readJsonl } from "../utils/jsonl.ts";

const alwaysReachableSeedProbe = async () => true;

function buildMockFetch(requestLog: string[]): typeof fetch {
  return (async (input: string | URL | Request): Promise<Response> => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const url = new URL(raw);
    requestLog.push(url.toString());

    if (url.hostname === "z.example") {
      throw new Error("network down");
    }

    if (url.hostname !== "a.example") {
      return new Response("Not found", { status: 404 });
    }

    if (
      url.pathname === "/careers" ||
      url.pathname === "/careers/SearchJobs" ||
      url.pathname === "/careers/SearchJobs/feed"
    ) {
      return new Response(
        `
          <html>
            <body>
              <a href="/careers/JobDetail/One/1?source=linkedin">One</a>
              <a href="/careers/JobDetail/Two/2">Two</a>
              <a href="/careers/Login">Login</a>
              <script>
                window.__INITIAL_STATE__ = {
                  "jobs": [{"url": "/careers/JobDetail/Two/2"}],
                  "jobOffset": 0,
                  "jobRecordsPerPage": 12,
                  "listFilterMode": 1
                };
              </script>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    if (url.pathname === "/careers/JobDetail/One/1") {
      return new Response(
        `
          <html>
            <body>
              <h1>Engineer One</h1>
              <div class="job-location">Remote</div>
              <time datetime="2026-03-01"></time>
              <div id="job-description"><p>Build systems one.</p></div>
              <a href="/apply/1">Apply now</a>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    if (url.pathname === "/careers/JobDetail/Two/2") {
      return new Response(
        `
          <html>
            <body>
              <h1>Engineer Two</h1>
              <div class="job-location">Zagreb</div>
              <div id="job-description"><p>Build systems two.</p></div>
              <a href="/apply/2">Apply now</a>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    if (url.pathname === "/careers/JobDetail/Seeded/9") {
      return new Response(
        `
          <html>
            <body>
              <h1>Seeded Engineer</h1>
              <div class="job-location">Berlin</div>
              <div id="job-description"><p>Seeded role.</p></div>
              <a href="/apply/9">Apply now</a>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

function buildFastProbeMockFetch(
  requestLog: string[],
  options: {
    hostCount: number;
    downHosts?: string[];
  },
): typeof fetch {
  const downHosts = new Set(options.downHosts ?? []);

  return (async (input: string | URL | Request): Promise<Response> => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const url = new URL(raw);
    requestLog.push(url.toString());

    const host = url.hostname;
    const hostMatch = /^h(\d+)\.example$/.exec(host);
    if (!hostMatch) {
      return new Response("Not found", { status: 404 });
    }

    const hostIndex = Number(hostMatch[1]);
    if (!Number.isFinite(hostIndex) || hostIndex < 1 || hostIndex > options.hostCount) {
      return new Response("Not found", { status: 404 });
    }

    if (downHosts.has(host)) {
      throw new Error("network down");
    }

    if (url.pathname === "/careers") {
      return new Response(
        `
          <html>
            <body>
              <a href="/careers/SearchJobs?jobOffset=0&jobRecordsPerPage=12&listFilterMode=1">Search</a>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    if (url.pathname === "/careers/SearchJobs") {
      return new Response(
        `
          <html>
            <body>
              <a href="/careers/JobDetail/H${hostIndex}/1">Role</a>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    if (url.pathname === `/careers/JobDetail/H${hostIndex}/1`) {
      return new Response(
        `
          <html>
            <body>
              <h1>Host ${hostIndex} Role</h1>
              <div id="job-description"><p>Role for host ${hostIndex}</p></div>
              <a href="/apply/${hostIndex}">Apply</a>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    return new Response("Not found", { status: 404 });
  }) as typeof fetch;
}

function buildPaginatedMockFetch(requestLog: string[]): typeof fetch {
  return (async (input: string | URL | Request): Promise<Response> => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const url = new URL(raw);
    requestLog.push(url.toString());

    if (url.hostname !== "a.example") {
      return new Response("Not found", { status: 404 });
    }

    if (url.pathname === "/careers") {
      return new Response(
        `
          <html>
            <body>
              <a href="/careers/SearchJobs?jobOffset=0&jobRecordsPerPage=12&listFilterMode=1">Search</a>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    if (url.pathname === "/careers/SearchJobs") {
      const offsetRaw = url.searchParams.get("jobOffset") ?? "0";
      const offset = Number(offsetRaw);

      if (Number.isFinite(offset) && offset === 12) {
        return new Response(
          `
            <html>
              <body>
                <a href="/careers/JobDetail/Two/2">Two</a>
                <div class="list-controls__text__legend" aria-label="24 results">
                  13-24 of 24 results
                </div>
              </body>
            </html>
          `,
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        );
      }

      if (Number.isFinite(offset) && offset >= 12) {
        return new Response(
          `
            <html>
              <body>
                <div>No results</div>
              </body>
            </html>
          `,
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        );
      }

      return new Response(
        `
          <html>
            <body>
              <a href="/careers/JobDetail/One/1">One</a>
              <div class="list-controls__text__legend" aria-label="24 results">
                1-12 of 24 results
              </div>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    if (url.pathname === "/careers/JobDetail/One/1") {
      return new Response(
        `
          <html>
            <body>
              <h1>Engineer One</h1>
              <div id="job-description"><p>Build systems one.</p></div>
              <a href="/apply/1">Apply now</a>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    if (url.pathname === "/careers/JobDetail/Two/2") {
      return new Response(
        `
          <html>
            <body>
              <h1>Engineer Two</h1>
              <div id="job-description"><p>Build systems two.</p></div>
              <a href="/apply/2">Apply now</a>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

function buildPaginatedNoLegendMockFetch(requestLog: string[]): typeof fetch {
  return (async (input: string | URL | Request): Promise<Response> => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const url = new URL(raw);
    requestLog.push(url.toString());

    if (url.hostname !== "a.example") {
      return new Response("Not found", { status: 404 });
    }

    if (url.pathname === "/careers") {
      return new Response(
        `
          <html>
            <body>
              <a href="/careers/SearchJobs?jobOffset=0&jobRecordsPerPage=12&listFilterMode=1">Search</a>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    if (url.pathname === "/careers/SearchJobs") {
      const offsetRaw = url.searchParams.get("jobOffset") ?? "0";
      const offset = Number(offsetRaw);

      if (Number.isFinite(offset) && offset === 6) {
        return new Response(
          `
            <html>
              <body>
                <a href="/careers/JobDetail/Two/2">Two</a>
              </body>
            </html>
          `,
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        );
      }

      if (Number.isFinite(offset) && offset >= 12) {
        return new Response(
          `
            <html>
              <body>
                <div>No results</div>
              </body>
            </html>
          `,
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        );
      }

      return new Response(
        `
          <html>
            <body>
              <a href="/careers/JobDetail/One/1">One</a>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    if (url.pathname === "/careers/JobDetail/One/1") {
      return new Response(
        `
          <html>
            <body>
              <h1>Engineer One</h1>
              <div id="job-description"><p>Build systems one.</p></div>
              <a href="/apply/1">Apply now</a>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    if (url.pathname === "/careers/JobDetail/Two/2") {
      return new Response(
        `
          <html>
            <body>
              <h1>Engineer Two</h1>
              <div id="job-description"><p>Build systems two.</p></div>
              <a href="/apply/2">Apply now</a>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

async function createFixture(inputLines?: string[]) {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), "avature-scraper-"));
  const inputPath = path.join(fixtureDir, "Urls.txt");
  const outputDir = path.join(fixtureDir, "output");
  const lines = inputLines ?? [
    "https://a.example/careers",
    "https://a.example/careers/SearchJobs?jobOffset=0&jobRecordsPerPage=12&listFilterMode=1",
    "https://a.example/careers/SearchJobs/feed?jobRecordsPerPage=6",
    "https://a.example/careers/JobDetail/Seeded/9?jobId=SEED-9",
    "https://a.example/careers/Login",
    "https://a.example/careers/Error",
    "https://z.example/careers",
    "https://z.example/careers/SearchJobs?jobOffset=0&jobRecordsPerPage=12",
    "https://z.example/careers/JobDetail/Down/999",
    "http://[invalid",
  ];

  await writeFile(inputPath, lines.join("\n"), "utf8");

  return {
    inputPath,
    outputDir,
    hostProfilesFile: path.join(outputDir, "host_profiles.json"),
    jobUrlsPath: path.join(outputDir, "job_urls.jsonl"),
    rejectedPath: path.join(outputDir, "rejected_urls.jsonl"),
    jobsPath: path.join(outputDir, "jobs.json"),
  };
}

describe("split pipeline integration", () => {
  test("runProfileBuilder filters unreachable hosts during seed collection", async () => {
    const fixture = await createFixture();

    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = buildMockFetch(requests);

    try {
      await runProfileBuilder({
        inputUrlsFile: fixture.inputPath,
        outputDir: fixture.outputDir,
        requestTimeoutMs: 500,
        maxRetries: 0,
        retryBaseDelayMs: 1,
        profileConcurrency: 2,
        seedProbeFn: async (host) => host !== "z.example",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const profiles = await readJsonFile<HostProfile[]>(fixture.hostProfilesFile);
    expect(profiles).toHaveLength(1);

    const aProfile = profiles.find((profile) => profile.host === "a.example");
    expect(aProfile?.reachability).toBe("reachable");
    expect(aProfile?.candidateCount).toBe(4);
    expect([...(aProfile?.reachableListingUrls ?? [])].sort()).toEqual([
      "https://a.example/careers",
      "https://a.example/careers/SearchJobs/feed?jobRecordsPerPage=6",
      "https://a.example/careers/SearchJobs?jobOffset=0&jobRecordsPerPage=12&listFilterMode=1",
    ].sort());
    expect(aProfile?.reachableSeedDetailUrls).toEqual([
      "https://a.example/careers/JobDetail/Seeded/9?jobId=SEED-9",
    ]);

    const zProfile = profiles.find((profile) => profile.host === "z.example");
    expect(zProfile).toBeUndefined();

    expect(fileExists(fixture.rejectedPath)).toBeFalse();
    expect(fileExists(fixture.jobUrlsPath)).toBeFalse();
    expect(fileExists(fixture.jobsPath)).toBeFalse();

    const zRequests = requests.filter((request) =>
      request.startsWith("https://z.example/"),
    );
    expect(zRequests).toEqual([]);
  });

  test("runScraper defaults to seeded mode and default host_profiles path", async () => {
    const fixture = await createFixture();

    const originalFetch = globalThis.fetch;
    const profileRequests: string[] = [];
    globalThis.fetch = buildMockFetch(profileRequests);
    try {
      await runProfileBuilder({
        inputUrlsFile: fixture.inputPath,
        outputDir: fixture.outputDir,
        requestTimeoutMs: 500,
        maxRetries: 0,
        retryBaseDelayMs: 1,
        profileConcurrency: 2,
        seedProbeFn: async (host) => host !== "z.example",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const scraperRequests: string[] = [];
    globalThis.fetch = buildMockFetch(scraperRequests);
    try {
      await runScraper({
        outputDir: fixture.outputDir,
        requestTimeoutMs: 500,
        maxRetries: 0,
        retryBaseDelayMs: 1,
        discoveryConcurrency: 2,
        detailConcurrency: 2,
        writeRejects: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const jobUrls = await readJsonl<JobUrlRecord>(fixture.jobUrlsPath);
    const rejected = await readJsonl<RejectedUrlRecord>(fixture.rejectedPath);
    const jobs = await readJsonFile<JobOutput[]>(fixture.jobsPath);

    expect(jobUrls).toHaveLength(2);
    expect(jobUrls.map((record) => record.canonicalJobDetailUrl).sort()).toEqual([
      "https://a.example/careers/JobDetail/One/1",
      "https://a.example/careers/JobDetail/Two/2",
    ]);

    expect(jobs).toHaveLength(3);
    expect(jobs.map((job) => job.jobTitle).sort()).toEqual([
      "Engineer One",
      "Engineer Two",
      "Seeded Engineer",
    ]);
    expect(rejected.some((item) => item.stage === "discovery")).toBeTrue();
    expect(scraperRequests.includes("https://z.example/careers")).toBeFalse();
  });

  test("runScraper generate mode uses legend totals to stop pagination early", async () => {
    const seededFixture = await createFixture([
      "https://a.example/careers/SearchJobs?jobRecordsPerPage=12&listFilterMode=1",
    ]);
    const generatedFixture = await createFixture([
      "https://a.example/careers/SearchJobs?jobRecordsPerPage=12&listFilterMode=1",
    ]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = buildPaginatedMockFetch([]);
    try {
      await runProfileBuilder({
        inputUrlsFile: seededFixture.inputPath,
        outputDir: seededFixture.outputDir,
        requestTimeoutMs: 500,
        maxRetries: 0,
        retryBaseDelayMs: 1,
        profileConcurrency: 2,
        seedProbeFn: alwaysReachableSeedProbe,
      });
      await runProfileBuilder({
        inputUrlsFile: generatedFixture.inputPath,
        outputDir: generatedFixture.outputDir,
        requestTimeoutMs: 500,
        maxRetries: 0,
        retryBaseDelayMs: 1,
        profileConcurrency: 2,
        seedProbeFn: alwaysReachableSeedProbe,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const seededRequests: string[] = [];
    const generatedRequests: string[] = [];
    try {
      globalThis.fetch = buildPaginatedMockFetch(seededRequests);
      await runScraper({
        outputDir: seededFixture.outputDir,
        requestTimeoutMs: 500,
        maxRetries: 0,
        retryBaseDelayMs: 1,
        discoveryConcurrency: 2,
        detailConcurrency: 2,
        profileSourceMode: "seeded",
      });

      globalThis.fetch = buildPaginatedMockFetch(generatedRequests);
      await runScraper({
        outputDir: generatedFixture.outputDir,
        requestTimeoutMs: 500,
        maxRetries: 0,
        retryBaseDelayMs: 1,
        discoveryConcurrency: 2,
        detailConcurrency: 2,
        profileSourceMode: "generate",
        generateMaxPages: 8,
        generateMaxTemplates: 4,
        generateEmptyPageStreak: 2,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const seededJobUrls = await readJsonl<JobUrlRecord>(seededFixture.jobUrlsPath);
    const generatedJobUrls = await readJsonl<JobUrlRecord>(generatedFixture.jobUrlsPath);
    const generatedUrls = generatedJobUrls.map((record) => record.canonicalJobDetailUrl);

    expect(seededJobUrls).toHaveLength(1);
    expect(generatedJobUrls.length).toBeGreaterThan(seededJobUrls.length);
    expect(generatedUrls).toContain("https://a.example/careers/JobDetail/Two/2");
    expect(
      generatedRequests.some((url) => url.includes("jobOffset=6")),
    ).toBeFalse();
    expect(
      generatedRequests.some((url) => url.includes("jobOffset=12")),
    ).toBeTrue();
    expect(
      generatedRequests.some((url) => url.includes("jobOffset=18")),
    ).toBeFalse();
    expect(
      generatedRequests.some((url) => url.includes("jobOffset=24")),
    ).toBeFalse();
  });

  test("runScraper generate mode falls back to fixed offset when legend is missing", async () => {
    const fixture = await createFixture([
      "https://a.example/careers/SearchJobs?jobRecordsPerPage=12&listFilterMode=1",
    ]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = buildPaginatedNoLegendMockFetch([]);
    try {
      await runProfileBuilder({
        inputUrlsFile: fixture.inputPath,
        outputDir: fixture.outputDir,
        requestTimeoutMs: 500,
        maxRetries: 0,
        retryBaseDelayMs: 1,
        profileConcurrency: 2,
        seedProbeFn: alwaysReachableSeedProbe,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const requests: string[] = [];
    globalThis.fetch = buildPaginatedNoLegendMockFetch(requests);
    try {
      await runScraper({
        outputDir: fixture.outputDir,
        requestTimeoutMs: 500,
        maxRetries: 0,
        retryBaseDelayMs: 1,
        discoveryConcurrency: 2,
        detailConcurrency: 2,
        profileSourceMode: "generate",
        generateMaxPages: 8,
        generateMaxTemplates: 4,
        generateEmptyPageStreak: 2,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(requests.some((url) => url.includes("jobOffset=6"))).toBeTrue();
    expect(requests.some((url) => url.includes("jobOffset=12"))).toBeTrue();
    expect(requests.some((url) => url.includes("jobOffset=18"))).toBeTrue();
    expect(requests.some((url) => url.includes("jobOffset=24"))).toBeFalse();
  });

  test("runProfileBuilder scales host probing without duplicate probe requests", async () => {
    const hostCount = 10;
    const downHosts = ["h9.example", "h10.example"];
    const fixture = await createFixture(
      Array.from({ length: hostCount }, (_, index) => {
        const n = index + 1;
        return [
          `https://h${n}.example/careers`,
          `https://h${n}.example/careers/SearchJobs?jobOffset=0&jobRecordsPerPage=12&listFilterMode=1`,
          `https://h${n}.example/careers/JobDetail/H${n}/1`,
        ];
      }).flat(),
    );

    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = buildFastProbeMockFetch(requests, {
      hostCount,
      downHosts,
    });

    try {
      await runProfileBuilder({
        inputUrlsFile: fixture.inputPath,
        outputDir: fixture.outputDir,
        requestTimeoutMs: 500,
        maxRetries: 0,
        retryBaseDelayMs: 1,
        seedProbeConcurrency: 16,
        seedProbeTimeoutMs: 200,
        seedProbeRetries: 0,
        profileConcurrency: 8,
        profileCandidateConcurrency: 8,
        seedProbeFn: async (host) => !downHosts.includes(host),
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const profiles = await readJsonFile<HostProfile[]>(fixture.hostProfilesFile);
    expect(profiles).toHaveLength(8);
    expect(profiles.every((profile) => profile.reachability === "reachable")).toBeTrue();

    for (let n = 1; n <= hostCount; n += 1) {
      const host = `h${n}.example`;
      const hostCareersRequests = requests.filter((request) => {
        const parsed = new URL(request);
        return parsed.hostname === host && parsed.pathname === "/careers";
      });

      if (downHosts.includes(host)) {
        expect(hostCareersRequests).toHaveLength(0);
      } else {
        // Reachable hosts are hit once during candidate profiling.
        expect(hostCareersRequests).toHaveLength(1);
      }
    }

    for (const downHost of downHosts) {
      const hostRequests = requests.filter((request) =>
        request.startsWith(`https://${downHost}/`),
      );
      expect(hostRequests).toEqual([]);
    }
  });
});
