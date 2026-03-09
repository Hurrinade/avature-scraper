import { extractJobDetail } from "../extractors/jobDetail.ts";
import type { HostProfile, JobOutput, RunOptions } from "../types/index.ts";
import { mapWithConcurrency } from "../utils/concurrency.ts";
import { fileExists, readJsonFile, writeJsonFile } from "../utils/fs.ts";
import { extractHost } from "../utils/url.ts";
import { dedupeJobs } from "./dedupe.ts";
import { discoverJobUrls } from "./discovery.ts";
import { profileHosts } from "./profile.ts";
import {
  appendReject,
  buildConfig,
  resetExtractionOutputFiles,
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
        const response = await fetch(detailUrl, {
          redirect: "follow",
          headers: {
            "user-agent": config.userAgent,
            accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
          },
        });

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

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function parseHostProfiles(raw: unknown): HostProfile[] {
  if (!Array.isArray(raw)) {
    throw new Error("Host profiles file must contain a JSON array");
  }

  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(
        `Invalid host profile at index ${index}: expected object`,
      );
    }

    const candidate = item as Partial<HostProfile>;
    if (typeof candidate.host !== "string" || !candidate.host.trim()) {
      throw new Error(`Invalid host profile at index ${index}: missing host`);
    }

    if (
      candidate.reachability !== "reachable" &&
      candidate.reachability !== "blocked" &&
      candidate.reachability !== "unreachable"
    ) {
      throw new Error(
        `Invalid host profile at index ${index}: bad reachability`,
      );
    }

    if (!isStringArray(candidate.reachableListingUrls)) {
      throw new Error(
        `Invalid host profile at index ${index}: reachableListingUrls must be string[]`,
      );
    }

    if (!isStringArray(candidate.reachableSeedDetailUrls)) {
      throw new Error(
        `Invalid host profile at index ${index}: reachableSeedDetailUrls must be string[]`,
      );
    }

    return {
      host: candidate.host,
      reachability: candidate.reachability,
      candidateCount: Number(candidate.candidateCount) || 0,
      reachableCandidateCount: Number(candidate.reachableCandidateCount) || 0,
      unreachableCandidateCount:
        Number(candidate.unreachableCandidateCount) || 0,
      reachableListingUrls: candidate.reachableListingUrls,
      reachableSeedDetailUrls: candidate.reachableSeedDetailUrls,
      checkedAt:
        typeof candidate.checkedAt === "string" && candidate.checkedAt
          ? candidate.checkedAt
          : new Date(0).toISOString(),
    } satisfies HostProfile;
  });
}

async function loadHostProfiles(config: RuntimeConfig): Promise<HostProfile[]> {
  if (!fileExists(config.hostProfilesFile)) {
    throw new Error(`Host profiles file not found: ${config.hostProfilesFile}`);
  }

  const raw = await readJsonFile<unknown>(config.hostProfilesFile);
  return parseHostProfiles(raw);
}

export async function runProfileBuilder(
  options: RunOptions = {},
): Promise<void> {
  const config = buildConfig({ ...options, writeRejects: false });

  if (!fileExists(config.inputUrlsFile)) {
    throw new Error(`Input URL file not found: ${config.inputUrlsFile}`);
  }

  console.log(`[seeds] reading ${config.inputUrlsFile}`);
  const seedHosts = await collectSeedHosts(config);
  console.log(`[seeds] hosts prepared: ${seedHosts.length}`);

  console.log(`[profile] profiling hosts`);
  const profiles = await profileHosts(config, seedHosts);
  await writeJsonFile(config.hostProfilesFile, profiles);

  const reachableHosts = profiles.filter(
    (profile) => profile.reachability === "reachable",
  ).length;
  console.log(
    `[profile] reachable hosts: ${reachableHosts}/${profiles.length}`,
  );
  console.log(`[profile] output: ${config.hostProfilesFile}`);
}

export async function runScraper(options: RunOptions = {}): Promise<void> {
  const config = buildConfig(options);
  const profiles = await loadHostProfiles(config);
  const scopedProfiles =
    typeof config.limitHosts === "number"
      ? profiles.slice(0, config.limitHosts)
      : profiles;

  console.log(
    `[profiles] loaded ${scopedProfiles.length} host profiles from ${config.hostProfilesFile}`,
  );
  console.log(`[profiles] source mode: ${config.profileSourceMode}`);

  await resetExtractionOutputFiles(config);

  console.log(`[discovery] extracting job detail URLs`);
  const discovery = await discoverJobUrls(config, scopedProfiles);
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
