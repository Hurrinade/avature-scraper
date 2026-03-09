import type { HostProfile, SeedHost } from "../types/index.ts";
import { mapWithConcurrency } from "../utils/concurrency.ts";
import { fetchWithRetry } from "../utils/fetchWithRetry.ts";
import {
  canonicalDetailUrl,
  isLikelyJobDetailUrl,
  isLikelyListingUrl,
} from "../utils/url.ts";
import {
  appendReject,
  fetchOptions,
  nowIso,
  type RuntimeConfig,
} from "./runtime.ts";

async function profileHost(
  config: RuntimeConfig,
  seedHost: SeedHost,
): Promise<HostProfile> {
  // Seed-only behavior: profile only URLs that came from Urls.txt.
  const candidates = Array.from(new Set(seedHost.candidateUrls));

  const reachableListings = new Set<string>();
  const reachableSeedDetails = new Set<string>();

  let reachableCandidateCount = 0;
  let unreachableCandidateCount = 0;
  let blockedResponses = 0;

  for (const candidate of candidates) {
    try {
      const response = await fetchWithRetry(candidate, fetchOptions(config));

      if (response.status === 403 || response.status === 429) {
        blockedResponses += 1;
      }

      if (!response.ok) {
        unreachableCandidateCount += 1;
        await appendReject(config, {
          stage: "profile",
          host: seedHost.host,
          url: candidate,
          reason: "unreachable_candidate",
          httpStatus: response.status,
        });
        continue;
      }

      reachableCandidateCount += 1;

      // Check if candidate is a listing url
      if (isLikelyListingUrl(candidate)) {
        reachableListings.add(candidate);
      }

      // Check if candidate is a job detail url
      if (isLikelyJobDetailUrl(candidate)) {
        const canonical = canonicalDetailUrl(candidate);
        if (canonical) {
          reachableSeedDetails.add(canonical);
        }
      }
    } catch {
      unreachableCandidateCount += 1;
      await appendReject(config, {
        stage: "profile",
        host: seedHost.host,
        url: candidate,
        reason: "fetch_failed",
      });
    }
  }

  const hasReachable =
    reachableListings.size > 0 || reachableSeedDetails.size > 0;
  // A host is considered blocked only when we observed block statuses and found nothing reachable.
  const reachability: HostProfile["reachability"] = hasReachable
    ? "reachable"
    : blockedResponses > 0
      ? "blocked"
      : "unreachable";

  if (reachability !== "reachable") {
    await appendReject(config, {
      stage: "profile",
      host: seedHost.host,
      url: `https://${seedHost.host}`,
      reason: `host_${reachability}`,
    });
  }

  return {
    host: seedHost.host,
    reachability,
    candidateCount: candidates.length,
    reachableCandidateCount,
    unreachableCandidateCount,
    reachableListingUrls: Array.from(reachableListings),
    reachableSeedDetailUrls: Array.from(reachableSeedDetails),
    checkedAt: nowIso(),
  };
}

// Stage 2: validate seeded host URLs and capture reusable query-pattern hints.
export async function profileHosts(
  config: RuntimeConfig,
  seedHosts: SeedHost[],
): Promise<HostProfile[]> {
  return mapWithConcurrency(
    seedHosts,
    config.profileConcurrency,
    async (host) => profileHost(config, host),
  );
}
