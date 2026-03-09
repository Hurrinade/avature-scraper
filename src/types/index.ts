export interface CliArgs {
  help: boolean;
  limitHosts?: number;
  limitJobs?: number;
  profileSourceMode?: ProfileSourceMode;
  hostProfilesFile?: string;
}

export interface ProfileCliArgs {
  help: boolean;
  limitHosts?: number;
  hostProfilesFile?: string;
}

export interface SeedHost {
  host: string;
  candidateUrls: string[];
  seededDetailUrls: string[];
}

export type HostReachability = "reachable" | "blocked" | "unreachable";
export type ProfileSourceMode = "seeded" | "generate";

export interface HostProfile {
  host: string;
  reachability: HostReachability;
  candidateCount: number;
  reachableCandidateCount: number;
  unreachableCandidateCount: number;
  reachableListingUrls: string[];
  reachableSeedDetailUrls: string[];
  checkedAt: string;
}

export interface JobUrlRecord {
  host: string;
  listingUrl: string;
  jobDetailUrl: string;
  canonicalJobDetailUrl: string;
  discoveredAt: string;
}

export interface RejectedUrlRecord {
  stage: "seeds" | "profile" | "discovery" | "details";
  url: string;
  host?: string;
  reason: string;
  httpStatus?: number;
  rejectedAt: string;
}

export interface JobOutput {
  jobTitle: string;
  jobDescriptionText?: string;
  jobDescriptionHtml?: string;
  applicationUrl?: string;
  metadata: Record<string, string | string[] | null>;
  jobDetailUrl: string;
  host: string;
  scrapedAt: string;
}

export interface RunOptions {
  cwd?: string;
  inputUrlsFile?: string;
  outputDir?: string;
  hostProfilesFile?: string;
  profileSourceMode?: ProfileSourceMode;
  limitHosts?: number;
  limitJobs?: number;
  writeRejects?: boolean;
  requestTimeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  profileConcurrency?: number;
  profileCandidateConcurrency?: number;
  discoveryConcurrency?: number;
  detailConcurrency?: number;
  seedProbeConcurrency?: number;
  seedProbeTimeoutMs?: number;
  seedProbeRetries?: number;
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
  generateMaxPages?: number;
  generateMaxTemplates?: number;
  generateEmptyPageStreak?: number;
  generateOffsetStep?: number;
  userAgent?: string;
}
