import { extractJobDetail } from "../extractors/jobDetail.ts";
import type { JobOutput, RunOptions } from "../types/index.ts";
import { mapWithConcurrency } from "../utils/concurrency.ts";
import { fetchWithRetry } from "../utils/fetchWithRetry.ts";
import { fileExists, writeJsonFile } from "../utils/fs.ts";
import { appendJsonl } from "../utils/jsonl.ts";
import { extractHost } from "../utils/url.ts";
import { dedupeJobs } from "./dedupe.ts";
import { discoverJobUrls } from "./discovery.ts";
import { profileHosts } from "./profile.ts";
import {
  appendReject,
  buildConfig,
  fetchOptions,
  resetOutputFiles,
  type RuntimeConfig,
} from "./runtime.ts";
import { collectSeedHosts } from "./seeds.ts";

// Stage 4: fetch detail pages and map them to final job records.
async function fetchJobDetails(
  config: RuntimeConfig,
  detailUrls: string[],
): Promise<JobOutput[]> {
  const jobs = await mapWithConcurrency(
    detailUrls,
    config.detailConcurrency,
    async (detailUrl) => {
      const host = extractHost(detailUrl) ?? "unknown";

      try {
        const response = await fetchWithRetry(detailUrl, fetchOptions(config));

        if (!response.ok) {
          await appendReject(config, {
            stage: "details",
            host,
            url: detailUrl,
            reason: "detail_unreachable",
            httpStatus: response.status,
          });
          return null;
        }

        const html = await response.text();
        return extractJobDetail(host, detailUrl, html);
      } catch {
        await appendReject(config, {
          stage: "details",
          host,
          url: detailUrl,
          reason: "detail_fetch_failed",
        });
        return null;
      }
    },
  );

  return jobs.filter((job): job is JobOutput => Boolean(job));
}

export async function runScraper(options: RunOptions = {}): Promise<void> {
  const config = buildConfig(options);

  if (!fileExists(config.inputUrlsFile)) {
    throw new Error(`Input URL file not found: ${config.inputUrlsFile}`);
  }

  await resetOutputFiles(config);

  console.log(`[seeds] reading ${config.inputUrlsFile}`);
  const seedHosts = await collectSeedHosts(config);
  console.log(`[seeds] hosts prepared: ${seedHosts.length}`);

  console.log(`[profile] profiling hosts`);
  const profiles = await profileHosts(config, seedHosts);
  for (const profile of profiles) {
    await appendJsonl(config.hostProfilesPath, profile);
  }
  const reachableHosts = profiles.filter(
    (profile) => profile.reachability === "reachable",
  ).length;
  console.log(`[profile] reachable hosts: ${reachableHosts}/${profiles.length}`);

  console.log(`[discovery] extracting job detail URLs`);
  const discovery = await discoverJobUrls(config, profiles);
  console.log(`[discovery] unique detail URLs: ${discovery.jobUrls.length}`);

  const allDetailUrls = Array.from(
    new Set([
      ...discovery.jobUrls.map((record) => record.canonicalJobDetailUrl),
      ...discovery.reachableSeedDetailUrls,
    ]),
  ).sort((a, b) => a.localeCompare(b));

  const targetDetailUrls =
    typeof config.limitJobs === "number"
      ? allDetailUrls.slice(0, config.limitJobs)
      : allDetailUrls;

  console.log(`[details] fetching detail pages: ${targetDetailUrls.length}`);
  const rawJobs = await fetchJobDetails(config, targetDetailUrls);
  console.log(`[details] extracted raw jobs: ${rawJobs.length}`);

  // Stage 5: final dedupe and write output.
  const dedupeResult = dedupeJobs(rawJobs);
  await writeJsonFile(config.jobsPath, dedupeResult.deduped);

  console.log(`[final] deduped jobs: ${dedupeResult.deduped.length}`);
  console.log(`[final] output: ${config.jobsPath}`);
}
