import { rm } from "node:fs/promises";
import { extractJobDetail } from "../extractors/jobDetail.ts";
import type {
  HostProfile,
  JobDetailCheckpointRecord,
  JobOutput,
  JobUrlRecord,
  RunOptions,
} from "../types/index.ts";
import { mapWithConcurrency } from "../utils/concurrency.ts";
import { fileExists, readJsonFile, writeJsonFile } from "../utils/fs.ts";
import { performHttpRequest } from "../utils/httpRequest.ts";
import {
  appendJsonl,
  appendJsonlMany,
  readJsonl,
  resetJsonl,
} from "../utils/jsonl.ts";
import { canonicalDetailUrl, extractHost } from "../utils/url.ts";
import { dedupeJobs } from "./dedupe.ts";
import { discoverJobUrls } from "./discovery.ts";
import { profileHosts } from "./profile.ts";
import {
  appendReject,
  buildConfig,
  nowIso,
  resetDiscoveryOutputFiles,
  resetExtractionOutputFiles,
  type RuntimeConfig,
} from "./runtime.ts";
import { collectSeedHosts } from "./seeds.ts";

interface FetchJobDetailsOptions {
  skipCanonicalUrls?: Set<string>;
  onAttempt?: (record: JobDetailCheckpointRecord) => Promise<void>;
}

interface FetchJobDetailsResult {
  jobs: JobOutput[];
  attemptedCount: number;
  skippedCount: number;
}

// Stage 4: fetch detail pages and map them to final job records.
async function fetchJobDetails(
  config: RuntimeConfig,
  detailUrls: string[],
  options: FetchJobDetailsOptions = {},
): Promise<FetchJobDetailsResult> {
  let attemptedCount = 0;
  let skippedCount = 0;

  const jobs = await mapWithConcurrency(
    detailUrls,
    config.detailConcurrency,
    async (detailUrl) => {
      const canonicalUrl = canonicalDetailUrl(detailUrl) ?? detailUrl;
      if (options.skipCanonicalUrls?.has(canonicalUrl)) {
        skippedCount += 1;
        return null;
      }

      const host = extractHost(canonicalUrl) ?? "unknown";
      attemptedCount += 1;

      try {
        const response = await performHttpRequest(
          canonicalUrl,
          config.userAgent,
          true,
          config.httpRequestFn,
          config.httpTimeoutMs,
        );

        if (
          response.statusCode < 200 ||
          response.statusCode >= 300 ||
          !response.bodyText
        ) {
          await appendReject(config, {
            stage: "details",
            host,
            url: canonicalUrl,
            reason: "detail_unreachable",
            httpStatus: response.statusCode,
          });
          if (options.onAttempt) {
            await options.onAttempt({
              url: canonicalUrl,
              status: "failed",
              attemptedAt: nowIso(),
            });
          }
          return null;
        }
        if (options.onAttempt) {
          await options.onAttempt({
            url: canonicalUrl,
            status: "success",
            attemptedAt: nowIso(),
          });
        }
        return extractJobDetail(host, canonicalUrl, response.bodyText);
      } catch {
        await appendReject(config, {
          stage: "details",
          host,
          url: canonicalUrl,
          reason: "detail_fetch_failed",
        });
        if (options.onAttempt) {
          await options.onAttempt({
            url: canonicalUrl,
            status: "failed",
            attemptedAt: nowIso(),
          });
        }
        return null;
      }
    },
  );

  return {
    jobs: jobs.filter((job): job is JobOutput => Boolean(job)),
    attemptedCount,
    skippedCount,
  };
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

function applyLimit<T>(items: T[], limit: number | undefined): T[] {
  return typeof limit === "number" ? items.slice(0, limit) : items;
}

function buildSeededDetailRecords(profiles: HostProfile[]): JobUrlRecord[] {
  const records: JobUrlRecord[] = [];

  for (const profile of profiles) {
    for (const detailUrl of profile.reachableSeedDetailUrls) {
      records.push({
        host: profile.host,
        listingUrl:
          profile.reachableListingUrls[0] ?? `https://${profile.host}/careers`,
        jobDetailUrl: detailUrl,
        canonicalJobDetailUrl: detailUrl,
        discoveredAt: nowIso(),
      });
    }
  }

  return records;
}

async function loadDetailUrlsFromJobUrlsFile(
  config: RuntimeConfig,
): Promise<string[]> {
  if (!fileExists(config.jobUrlsPath)) {
    throw new Error(`Job URLs file not found: ${config.jobUrlsPath}`);
  }

  let rawRows: unknown[];
  try {
    rawRows = await readJsonl<unknown>(config.jobUrlsPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid job URLs JSONL file (${config.jobUrlsPath}): ${message}`,
    );
  }

  const canonicalUrls = new Set<string>();
  for (const [index, row] of rawRows.entries()) {
    let candidateUrl: string | undefined;

    if (typeof row === "string") {
      candidateUrl = row;
    } else if (row && typeof row === "object") {
      const record = row as Partial<JobUrlRecord>;
      if (typeof record.canonicalJobDetailUrl === "string") {
        candidateUrl = record.canonicalJobDetailUrl;
      } else if (typeof record.jobDetailUrl === "string") {
        candidateUrl = record.jobDetailUrl;
      }
    }

    if (!candidateUrl?.trim()) {
      throw new Error(
        `Invalid job URL record at index ${index}: expected canonicalJobDetailUrl`,
      );
    }

    const canonical = canonicalDetailUrl(candidateUrl);
    if (!canonical) {
      throw new Error(
        `Invalid job URL record at index ${index}: invalid detail URL`,
      );
    }
    canonicalUrls.add(canonical);
  }

  return Array.from(canonicalUrls).sort((a, b) => a.localeCompare(b));
}

async function loadProcessedDetailUrls(
  config: RuntimeConfig,
): Promise<Set<string>> {
  const records = await readJsonl<unknown>(config.detailCheckpointPath);
  const urls = new Set<string>();

  for (const row of records) {
    if (!row || typeof row !== "object") continue;
    const candidate = row as Partial<JobDetailCheckpointRecord>;
    if (typeof candidate.url !== "string" || !candidate.url.trim()) continue;

    const canonical = canonicalDetailUrl(candidate.url);
    if (!canonical) continue;
    urls.add(canonical);
  }

  return urls;
}

async function appendDetailCheckpoint(
  config: RuntimeConfig,
  record: JobDetailCheckpointRecord,
): Promise<void> {
  await appendJsonl(config.detailCheckpointPath, record);
}

async function mergeAndWriteJobs(
  config: RuntimeConfig,
  newJobs: JobOutput[],
): Promise<{ dedupedCount: number; addedCount: number }> {
  const existingJobs = fileExists(config.jobsPath)
    ? await readJsonFile<JobOutput[]>(config.jobsPath)
    : [];

  const before = existingJobs.length;
  const dedupeResult = dedupeJobs([...existingJobs, ...newJobs]);
  await writeJsonFile(config.jobsPath, dedupeResult.deduped);

  return {
    dedupedCount: dedupeResult.deduped.length,
    addedCount: Math.max(0, dedupeResult.deduped.length - before),
  };
}

function mergeHostProfiles(
  existing: HostProfile[],
  incoming: HostProfile[],
): HostProfile[] {
  const byHost = new Map<string, HostProfile>();

  for (const profile of existing) {
    byHost.set(profile.host, profile);
  }
  for (const profile of incoming) {
    byHost.set(profile.host, profile);
  }

  return Array.from(byHost.values()).sort((a, b) =>
    a.host.localeCompare(b.host),
  );
}

export async function runProfileBuilder(
  options: RunOptions = {},
): Promise<void> {
  const config = buildConfig({ ...options, writeRejects: false });
  if (options.freshRun) {
    await rm(config.hostProfilesFile, { force: true });
  }

  if (!fileExists(config.inputUrlsFile)) {
    throw new Error(`Input URL file not found: ${config.inputUrlsFile}`);
  }

  const existingProfiles = fileExists(config.hostProfilesFile)
    ? await loadHostProfiles(config)
    : [];
  const passedHosts = new Set(existingProfiles.map((profile) => profile.host));

  console.log(`[seeds] reading ${config.inputUrlsFile}`);
  const seedHosts = await collectSeedHosts(config);
  console.log(`[seeds] hosts prepared: ${seedHosts.length}`);

  const toProfile = seedHosts.filter((seedHost) => !passedHosts.has(seedHost.host));
  const skippedHosts = seedHosts.length - toProfile.length;

  console.log(`[profile] hosts already passed (skipped): ${skippedHosts}`);
  console.log(`[profile] profiling hosts now: ${toProfile.length}`);
  const newlyProfiled = await profileHosts(config, toProfile);
  const mergedProfiles = mergeHostProfiles(existingProfiles, newlyProfiled);
  await writeJsonFile(config.hostProfilesFile, mergedProfiles);

  const reachableHosts = mergedProfiles.filter(
    (profile) => profile.reachability === "reachable",
  ).length;
  console.log(
    `[profile] reachable hosts: ${reachableHosts}/${mergedProfiles.length}`,
  );
  console.log(`[profile] output: ${config.hostProfilesFile}`);
}

export async function runScraper(options: RunOptions = {}): Promise<void> {
  const config = buildConfig(options);
  const profiles = await loadHostProfiles(config);
  const scopedProfiles = applyLimit(profiles, config.limitHosts);

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

  const targetDetailUrls = applyLimit(allDetailUrls, config.limitJobs);

  console.log(`[details] fetching detail pages: ${targetDetailUrls.length}`);
  const detailResult = await fetchJobDetails(config, targetDetailUrls);
  console.log(`[details] extracted raw jobs: ${detailResult.jobs.length}`);

  // Stage 5: final dedupe and write output.
  const dedupeResult = dedupeJobs(detailResult.jobs);
  await writeJsonFile(config.jobsPath, dedupeResult.deduped);

  console.log(`[final] deduped jobs: ${dedupeResult.deduped.length}`);
  console.log(`[final] output: ${config.jobsPath}`);
}

export async function runDiscoveryOnly(
  options: RunOptions = {},
): Promise<void> {
  const config = buildConfig(options);
  const profiles = await loadHostProfiles(config);
  const scopedProfiles = applyLimit(profiles, config.limitHosts);

  console.log(
    `[profiles] loaded ${scopedProfiles.length} host profiles from ${config.hostProfilesFile}`,
  );
  console.log(`[profiles] source mode: ${config.profileSourceMode}`);

  await resetDiscoveryOutputFiles(config);

  console.log(`[discovery] extracting job detail URLs`);
  const discovery = await discoverJobUrls(config, scopedProfiles);
  const seededDetailRecords = buildSeededDetailRecords(scopedProfiles);

  const merged = new Map<string, JobUrlRecord>();
  for (const record of [...discovery.jobUrls, ...seededDetailRecords]) {
    if (!merged.has(record.canonicalJobDetailUrl)) {
      merged.set(record.canonicalJobDetailUrl, record);
    }
  }
  const records = Array.from(merged.values()).sort((a, b) =>
    a.canonicalJobDetailUrl.localeCompare(b.canonicalJobDetailUrl),
  );

  await resetJsonl(config.jobUrlsPath);
  await appendJsonlMany(config.jobUrlsPath, records);

  console.log(`[discovery] from listing pages: ${discovery.jobUrls.length}`);
  console.log(
    `[discovery] seeded detail URLs included: ${seededDetailRecords.length}`,
  );
  console.log(`[discovery] total unique detail URLs: ${records.length}`);
  console.log(`[discovery] output: ${config.jobUrlsPath}`);
}

export async function runDetailsOnly(options: RunOptions = {}): Promise<void> {
  const config = buildConfig(options);

  if (options.freshRun) {
    await rm(config.detailCheckpointPath, { force: true });
    await rm(config.jobsPath, { force: true });
  }

  const processedUrls = await loadProcessedDetailUrls(config);
  const allDetailUrls = await loadDetailUrlsFromJobUrlsFile(config);
  const targetDetailUrls = applyLimit(allDetailUrls, config.limitJobs);

  console.log(`[details] loaded detail URLs: ${targetDetailUrls.length}`);
  console.log(
    `[details] already processed from checkpoint: ${processedUrls.size}`,
  );

  const detailResult = await fetchJobDetails(config, targetDetailUrls, {
    skipCanonicalUrls: processedUrls,
    onAttempt: async (record) => {
      await appendDetailCheckpoint(config, record);
      processedUrls.add(record.url);
    },
  });

  const mergeResult = await mergeAndWriteJobs(config, detailResult.jobs);
  console.log(`[details] attempted now: ${detailResult.attemptedCount}`);
  console.log(
    `[details] skipped from checkpoint: ${detailResult.skippedCount}`,
  );
  console.log(`[details] extracted raw jobs: ${detailResult.jobs.length}`);
  console.log(`[final] added deduped jobs: ${mergeResult.addedCount}`);
  console.log(`[final] total deduped jobs: ${mergeResult.dedupedCount}`);
  console.log(`[final] output: ${config.jobsPath}`);
  console.log(`[details] checkpoint: ${config.detailCheckpointPath}`);
}
