import path from "node:path";
import { rm } from "node:fs/promises";
import type {
  ProfileSourceMode,
  RejectedUrlRecord,
  RunOptions,
} from "../types/index.ts";
import { ensureDir } from "../utils/fs.ts";
import { appendJsonl, resetJsonl } from "../utils/jsonl.ts";

export interface RuntimeConfig {
  inputUrlsFile: string;
  outputDir: string;
  hostProfilesFile: string;
  profileSourceMode: ProfileSourceMode;
  writeRejects: boolean;
  jobUrlsPath: string;
  rejectedUrlsPath: string;
  jobsPath: string;
  limitHosts?: number;
  limitJobs?: number;
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  profileConcurrency: number;
  discoveryConcurrency: number;
  detailConcurrency: number;
  userAgent: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function toPositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number") return fallback;
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return toPositiveInt(parsed, fallback);
}

function envNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function resolvePath(
  cwd: string,
  value: string | undefined,
  fallbackRelative: string,
): string {
  if (!value) return path.resolve(cwd, fallbackRelative);
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

// Runtime config is centralized so stage files stay focused on stage logic.
export function buildConfig(options: RunOptions): RuntimeConfig {
  const cwd = options.cwd ?? process.cwd();
  const outputDir = resolvePath(
    cwd,
    options.outputDir,
    process.env.OUTPUT_DIR ?? "output",
  );

  return {
    inputUrlsFile: resolvePath(
      cwd,
      options.inputUrlsFile,
      process.env.INPUT_URLS_FILE ?? "Urls.txt",
    ),
    outputDir,
    hostProfilesFile: resolvePath(
      cwd,
      options.hostProfilesFile,
      path.join(outputDir, "host_profiles.json"),
    ),
    profileSourceMode: options.profileSourceMode ?? "seeded",
    writeRejects: options.writeRejects ?? true,
    jobUrlsPath: path.resolve(outputDir, "job_urls.jsonl"),
    rejectedUrlsPath: path.resolve(outputDir, "rejected_urls.jsonl"),
    jobsPath: path.resolve(outputDir, "jobs.json"),
    limitHosts: options.limitHosts,
    limitJobs: options.limitJobs,
    requestTimeoutMs: toPositiveInt(
      options.requestTimeoutMs,
      envPositiveInt("REQUEST_TIMEOUT_MS", 15000),
    ),
    maxRetries: envNonNegativeInt("MAX_RETRIES", options.maxRetries ?? 2),
    retryBaseDelayMs: toPositiveInt(
      options.retryBaseDelayMs,
      envPositiveInt("RETRY_BASE_DELAY_MS", 350),
    ),
    profileConcurrency: toPositiveInt(
      options.profileConcurrency,
      envPositiveInt("PROFILE_CONCURRENCY", 8),
    ),
    discoveryConcurrency: toPositiveInt(
      options.discoveryConcurrency,
      envPositiveInt("DISCOVERY_CONCURRENCY", 6),
    ),
    detailConcurrency: toPositiveInt(
      options.detailConcurrency,
      envPositiveInt("DETAIL_CONCURRENCY", 8),
    ),
    userAgent:
      options.userAgent ??
      process.env.SCRAPER_USER_AGENT ??
      "Mozilla/5.0 (compatible; avature-scraper/2.0; +https://example.com/bot)",
  };
}

export function fetchOptions(config: RuntimeConfig) {
  return {
    timeoutMs: config.requestTimeoutMs,
    retries: config.maxRetries,
    baseDelayMs: config.retryBaseDelayMs,
    userAgent: config.userAgent,
  };
}

export async function appendReject(
  config: RuntimeConfig,
  record: Omit<RejectedUrlRecord, "rejectedAt">,
): Promise<void> {
  if (!config.writeRejects) return;

  await appendJsonl(config.rejectedUrlsPath, {
    ...record,
    rejectedAt: nowIso(),
  } satisfies RejectedUrlRecord);
}

export async function resetExtractionOutputFiles(
  config: RuntimeConfig,
): Promise<void> {
  await ensureDir(config.outputDir);
  await resetJsonl(config.jobUrlsPath);
  await resetJsonl(config.rejectedUrlsPath);
  await rm(config.jobsPath, { force: true });
}
