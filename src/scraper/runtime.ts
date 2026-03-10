import path from "node:path";
import { rm } from "node:fs/promises";
import type {
  RunOptions,
  ProfileSourceMode,
  RejectedUrlRecord,
} from "../types/index.ts";
import { ensureDir } from "../utils/fs.ts";
import { appendJsonl, resetJsonl } from "../utils/jsonl.ts";

export interface RuntimeConfig {
  inputUrlsFile: string;
  outputDir: string;
  hostProfilesFile: string;
  detailCheckpointPath: string;
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
  profileCandidateConcurrency: number;
  discoveryConcurrency: number;
  detailConcurrency: number;
  seedProbeConcurrency: number;
  seedProbeTimeoutMs: number;
  seedProbeRetries: number;
  httpTimeoutMs: number;
  seedProbeFn?: (
    host: string,
    port: number,
    timeoutMs: number,
  ) => Promise<boolean>;
  httpRequestFn?: (
    url: string,
    userAgent: string,
    readBody: boolean,
  ) => Promise<{
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    bodyText?: string;
  }>;
  generateMaxPages: number;
  generateMaxTemplates: number;
  generateEmptyPageStreak: number;
  generateOffsetStep: number;
  discoveryTemplateConcurrency: number;
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
    detailCheckpointPath: resolvePath(
      cwd,
      options.detailCheckpointFile,
      path.join(outputDir, "job_detail_checkpoint.jsonl"),
    ),
    profileSourceMode: options.profileSourceMode ?? "generate",
    writeRejects: options.writeRejects ?? false,
    jobUrlsPath: resolvePath(
      cwd,
      options.jobUrlsFile ?? options.discoveredUrlsFile,
      path.join(outputDir, "job_urls.jsonl"),
    ),
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
    profileCandidateConcurrency: toPositiveInt(
      options.profileCandidateConcurrency,
      envPositiveInt("PROFILE_CANDIDATE_CONCURRENCY", 8),
    ),
    discoveryConcurrency: toPositiveInt(
      options.discoveryConcurrency,
      envPositiveInt("DISCOVERY_CONCURRENCY", 6),
    ),
    detailConcurrency: toPositiveInt(
      options.detailConcurrency,
      envPositiveInt("DETAIL_CONCURRENCY", 8),
    ),
    seedProbeConcurrency: toPositiveInt(
      options.seedProbeConcurrency,
      envPositiveInt("SEED_PROBE_CONCURRENCY", 16),
    ),
    seedProbeTimeoutMs: toPositiveInt(
      options.seedProbeTimeoutMs,
      envPositiveInt("SEED_PROBE_TIMEOUT_MS", 4000),
    ),
    seedProbeRetries: envNonNegativeInt(
      "SEED_PROBE_RETRIES",
      options.seedProbeRetries ?? 0,
    ),
    httpTimeoutMs: toPositiveInt(
      options.httpTimeoutMs,
      envPositiveInt("HTTP_TIMEOUT_MS", 8000),
    ),
    seedProbeFn: options.seedProbeFn,
    httpRequestFn: options.httpRequestFn,
    generateMaxPages: toPositiveInt(
      options.generateMaxPages,
      envPositiveInt("GENERATE_MAX_PAGES", 250),
    ),
    generateMaxTemplates: toPositiveInt(
      options.generateMaxTemplates,
      envPositiveInt("GENERATE_MAX_TEMPLATES", 60),
    ),
    generateEmptyPageStreak: toPositiveInt(
      options.generateEmptyPageStreak,
      envPositiveInt("GENERATE_EMPTY_PAGE_STREAK", 2),
    ),
    generateOffsetStep: toPositiveInt(
      options.generateOffsetStep,
      envPositiveInt("GENERATE_OFFSET_STEP", 6),
    ),
    discoveryTemplateConcurrency: toPositiveInt(
      options.discoveryTemplateConcurrency,
      envPositiveInt("DISCOVERY_TEMPLATE_CONCURRENCY", 3),
    ),
    userAgent:
      options.userAgent ??
      process.env.SCRAPER_USER_AGENT ??
      "Mozilla/5.0 (compatible; avature-scraper/2.0; +https://example.com/bot)",
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

export async function resetDiscoveryOutputFiles(
  config: RuntimeConfig,
): Promise<void> {
  await ensureDir(config.outputDir);
  await resetJsonl(config.jobUrlsPath);
  await resetJsonl(config.rejectedUrlsPath);
}
