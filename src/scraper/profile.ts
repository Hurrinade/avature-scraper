import type { HostProfile, SeedHost } from "../types/index.ts";
import { mapWithConcurrency } from "../utils/concurrency.ts";
import {
  canonicalDetailUrl,
  isLikelyJobDetailUrl,
  isLikelyListingUrl,
} from "../utils/url.ts";
import { appendReject, nowIso, type RuntimeConfig } from "./runtime.ts";
import { performHttpRequest } from "../utils/httpRequest.ts";

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

  await mapWithConcurrency(
    candidates,
    config.profileCandidateConcurrency,
    async (candidate) => {
      try {
        const response = await performHttpRequest(
          candidate,
          config.userAgent,
          false,
          config.httpRequestFn,
          config.httpTimeoutMs,
        );

        if (response.statusCode === 403 || response.statusCode === 429) {
          blockedResponses += 1;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          unreachableCandidateCount += 1;
          await appendReject(config, {
            stage: "profile",
            host: seedHost.host,
            url: candidate,
            reason: "unreachable_candidate",
            httpStatus: response.statusCode,
          });
          return;
        }

        reachableCandidateCount += 1;

        if (isLikelyListingUrl(candidate)) {
          reachableListings.add(candidate);
        }

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
    },
  );

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
